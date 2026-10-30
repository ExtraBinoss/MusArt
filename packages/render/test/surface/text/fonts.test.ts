import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { FONT_CATALOG } from "@musart/assets";
import {
  FontRepository,
  MAX_FONT_BYTES,
  fontFamilyKey,
  normalizeFontFamily,
  weightedGlyph,
} from "../../../src/surface/text/fonts";
import * as shaping from "../../../src/surface/text/shaping";
import { outlineFont } from "../../text-fixture";
import { installCanvasMock } from "../../canvas-fixture";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mockFaces() {
  const bytes = outlineFont().toArrayBuffer();
  const handles: { dispose: ReturnType<typeof vi.fn>; shape: ReturnType<typeof vi.fn> }[] = [];
  const create = vi.spyOn(shaping, "createShaper").mockImplementation(async (_bytes, getGlyph) => {
    let closed = false;
    const handle = {
      dispose: vi.fn(() => {
        closed = true;
      }),
      shape: vi.fn((_text: string, weight: number) => {
        if (closed) throw new Error("Font shaper is disposed.");
        return [{ glyph: getGlyph(1), advance: weight, dx: 0, dy: 0, cluster: 0 }];
      }),
    };
    handles.push(handle);
    return handle;
  });
  const fetcher = vi.fn(
    async (_url: string, _options?: RequestInit) => new Response(new Uint8Array(bytes)),
  );
  vi.stubGlobal("fetch", fetcher);
  return { bytes, handles, create, fetcher };
}
async function warm(repository: FontRepository, family: string) {
  const lease = await repository.acquire(family);
  lease.release();
  return lease.font;
}
it("loads actual local outlines, maps every catalog family and keeps legacy aliases prototype-safe", async () => {
  installCanvasMock();
  const repository = new FontRepository();
  const [first, alias] = await Promise.all([
    repository.acquire("Inter"),
    repository.acquire("Inter Variable"),
  ]);
  expect(first.font).toBe(alias.font);
  expect(first.font.charToGlyph("é").index).toBeGreaterThan(0);
  expect(fetch).toHaveBeenCalledWith("/fonts/inter/font.ttf", { signal: expect.any(AbortSignal) });
  const bold = await repository.acquire("Tinos", 700);
  expect(fetch).toHaveBeenCalledWith("/fonts/tinos/bold.ttf", { signal: expect.any(AbortSignal) });
  first.release();
  alias.release();
  bold.release();
  repository.clear();
  expect(() => first.font.shape!("A", 400)).toThrow("disposed");
  for (const face of FONT_CATALOG) {
    expect(fontFamilyKey(face.family)).toBe(face.id);
    expect(fontFamilyKey(face.id)).toBe(face.id);
  }
  expect(fontFamilyKey('"Arial"')).toBe("arimo");
  expect(fontFamilyKey("Georgia")).toBe("tinos");
  expect(fontFamilyKey("monospace")).toBe("roboto-mono");
  for (const unknown of ["unavailable", "__proto__", "constructor"])
    expect(fontFamilyKey(unknown)).toBe("inter");
  expect(normalizeFontFamily(" 'Custom:AbC' ")).toBe("custom:abc");
});
it("keeps exactly the last five idle faces warm, evicts the sixth and refetches an evicted face once", async () => {
  const { handles, fetcher } = mockFaces(),
    repository = new FontRepository();
  const names = FONT_CATALOG.slice(0, 6).map((face) => face.family);
  const first = await warm(repository, names[0]!);
  for (const name of names.slice(1)) await warm(repository, name);
  expect(handles[0]!.dispose).toHaveBeenCalledOnce();
  expect(() => first.shape!("A", 400)).toThrow("disposed");
  for (const name of names.slice(1)) await warm(repository, name);
  expect(fetcher).toHaveBeenCalledTimes(6);
  const replacement = await warm(repository, names[0]!);
  expect(replacement).not.toBe(first);
  expect(fetcher).toHaveBeenCalledTimes(7);
  await warm(repository, names[0]!);
  expect(fetcher).toHaveBeenCalledTimes(7);
  repository.clear();
  repository.clear();
  for (const handle of handles) expect(handle.dispose).toHaveBeenCalledOnce();
});
it("uses recent access rather than insertion order for eviction", async () => {
  const { handles, fetcher } = mockFaces(),
    repository = new FontRepository();
  const names = FONT_CATALOG.slice(0, 6).map((face) => face.family);
  for (const name of names.slice(0, 5)) await warm(repository, name);
  await warm(repository, names[0]!);
  await warm(repository, names[5]!);
  expect(handles[0]!.dispose).not.toHaveBeenCalled();
  expect(handles[1]!.dispose).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledTimes(6);
  repository.clear();
});
it("pins active users across LRU pressure and clear, then frees the last released lease exactly once", async () => {
  const { handles } = mockFaces(),
    repository = new FontRepository();
  const first = await repository.acquire("Inter"),
    second = await repository.acquire("Inter Variable");
  for (const face of FONT_CATALOG.slice(1, 7)) await warm(repository, face.family);
  expect(handles[0]!.dispose).not.toHaveBeenCalled();
  expect(first.font.shape!("A", 700)[0]!.advance).toBe(700);
  repository.clear();
  first.release();
  first.release();
  expect(handles[0]!.dispose).not.toHaveBeenCalled();
  expect(second.font.shape!("A", 400)[0]!.advance).toBe(400);
  second.release();
  second.release();
  expect(handles[0]!.dispose).toHaveBeenCalledOnce();
  for (const handle of handles) expect(handle.dispose).toHaveBeenCalledOnce();
});
it("deduplicates pending requests but returns independently releasable leases", async () => {
  const { bytes, fetcher, handles } = mockFaces(),
    repository = new FontRepository();
  let finish!: (value: Response) => void;
  fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const a = repository.acquire("Inter"),
    b = repository.acquire("Inter Variable");
  expect(fetcher).toHaveBeenCalledOnce();
  finish(new Response(new Uint8Array(bytes)));
  const [first, second] = await Promise.all([a, b]);
  expect(first).not.toBe(second);
  expect(first.font).toBe(second.font);
  repository.clear();
  first.release();
  expect(handles[0]!.dispose).not.toHaveBeenCalled();
  second.release();
  expect(handles[0]!.dispose).toHaveBeenCalledOnce();
});
it.each(["resolve", "reject"] as const)(
  "invalidates pending requests on clear without a stale %s deleting the newer entry",
  async (result) => {
    const { bytes, fetcher, handles } = mockFaces(),
      repository = new FontRepository();
    let resolve!: (value: Response) => void, reject!: (reason: unknown) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((done, fail) => {
          resolve = done;
          reject = fail;
        }),
    );
    const old = repository.acquire("Inter"),
      rejection = expect(old).rejects.toThrow("cleared");
    const oldSignal = fetcher.mock.calls[0]![1]!.signal!;
    repository.clear();
    expect(oldSignal.aborted).toBe(true);
    const fresh = await repository.acquire("Inter");
    if (result === "resolve") resolve(new Response(new Uint8Array(bytes)));
    else reject(new Error("Old fetch failed"));
    await rejection;
    const again = await repository.acquire("Inter");
    expect(again.font).toBe(fresh.font);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fresh.font.shape!("A", 500)[0]!.advance).toBe(500);
    fresh.release();
    again.release();
    repository.clear();
    expect(handles).toHaveLength(1);
    expect(handles[0]!.dispose).toHaveBeenCalledOnce();
  },
);
it("disposes native shaping that resolves after clear instead of publishing stale font metadata", async () => {
  const { create } = mockFaces(),
    repository = new FontRepository();
  let finish!: (value: Awaited<ReturnType<typeof shaping.createShaper>>) => void;
  const dispose = vi.fn();
  create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = repository.acquire("Inter"),
    rejection = expect(pending).rejects.toThrow("cleared");
  await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
  repository.clear();
  finish({ shape: vi.fn(() => []), dispose });
  await rejection;
  expect(dispose).toHaveBeenCalledOnce();
  repository.clear();
  expect(dispose).toHaveBeenCalledOnce();
});
it("rejects failed, oversized, invalid and failed-shaping fonts and permits retries", async () => {
  const { fetcher, create } = mockFaces(),
    repository = new FontRepository();
  fetcher.mockResolvedValueOnce(new Response("", { status: 404 }));
  await expect(repository.acquire("Inter")).rejects.toThrow("404");
  fetcher.mockResolvedValueOnce(new Response(new Uint8Array(MAX_FONT_BYTES + 1)));
  await expect(repository.acquire("Inter")).rejects.toThrow("32 MiB");
  fetcher.mockResolvedValueOnce(new Response("bad-font"));
  await expect(repository.acquire("Inter")).rejects.toThrow();
  create.mockRejectedValueOnce(new Error("Shaping failed"));
  await expect(repository.acquire("Inter")).rejects.toThrow("Shaping failed");
  const lease = await repository.acquire("Inter");
  lease.release();
  repository.clear();
});
it("attempts every idle cleanup even when one native destructor fails", async () => {
  const { handles } = mockFaces(),
    repository = new FontRepository();
  await warm(repository, "Inter");
  await warm(repository, "Arimo");
  handles[0]!.dispose.mockImplementationOnce(() => {
    throw new Error("Native free failed");
  });
  expect(() => repository.clear()).toThrow(AggregateError);
  expect(handles[1]!.dispose).toHaveBeenCalledOnce();
  expect(() => repository.clear()).not.toThrow();
  expect(handles[0]!.dispose).toHaveBeenCalledOnce();
});
it("resolves custom and Google family/weight identities without falling back or sharing unrelated faces", async () => {
  const { bytes, fetcher } = mockFaces(),
    resolver = vi.fn(async (_family: string, _weight: number, _signal?: AbortSignal) => bytes);
  const repository = new FontRepository({ resolver });
  const custom = await repository.acquire("custom:ABC", 400),
    google = await repository.acquire("Noto Sans JP", 400),
    bold = await repository.acquire("Noto Sans JP", 700),
    alias = await repository.acquire("  noto   sans jp  ", 400);
  expect(resolver).toHaveBeenCalledTimes(3);
  expect(fetcher).not.toHaveBeenCalled();
  expect(custom.font).not.toBe(google.font);
  expect(bold.font).not.toBe(google.font);
  expect(alias.font).toBe(google.font);
  expect(resolver).toHaveBeenCalledWith("custom:ABC", 400, expect.any(AbortSignal));
  for (const lease of [custom, google, bold, alias]) lease.release();
  repository.clear();
});
it("uses real variation coordinates and keeps static outlines unchanged", () => {
  const font = outlineFont(),
    glyph = font.charToGlyph("A");
  expect(weightedGlyph(font, glyph, 700)).toBe(glyph);
  font.variation = { getTransform: vi.fn(() => glyph) };
  expect(weightedGlyph(font, glyph, 600)).toBe(glyph);
  expect(font.variation.getTransform).toHaveBeenCalledWith(glyph, { wght: 600, opsz: 14 });
});
it("rejects explicit imported/system identities when no platform resolver is available", async () => {
  const { fetcher } = mockFaces(),
    repository = new FontRepository();
  for (const family of ["custom:abcdef", "local:MyFont"])
    await expect(repository.acquire(family)).rejects.toThrow("requires a font resolver");
  expect(fetcher).not.toHaveBeenCalled();
  repository.clear();
});

it("owns lazy font bytes independently of a mutable platform resolver buffer", async () => {
  const bytes = new Uint8Array(await readFile("apps/web/public/fonts/inter/font.ttf"));
  const repository = new FontRepository({ resolver: async () => bytes.buffer });
  const lease = await repository.acquire("custom:owned-font", 800);
  bytes.fill(0);
  const glyph = lease.font.charToGlyph("é");
  expect(glyph.index).toBeGreaterThan(0);
  const path = weightedGlyph(lease.font, glyph, 800).getPath(0, 0, lease.font.unitsPerEm);
  expect(path.commands.length).toBeGreaterThan(0);
  expect(lease.font.shape!("AV", 800)).toHaveLength(2);
  lease.release();
  repository.clear();
});

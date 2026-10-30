import { afterEach, expect, test, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { FONT_CATALOG } from "@musart/assets";
import {
  FontSampleCache,
  FONT_SAMPLE_LIMITS,
  type FontSampleState,
} from "../../../../src/components/properties/fonts/sample-cache";
import { bundledFontLibrary } from "../../../../src/components/properties/fonts/library-context";

const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
});
function nativeFaces() {
  const loaded = new Set<FontFace>(),
    removed = vi.fn((face: FontFace) => loaded.delete(face));
  class Face {
    status = "unloaded";
    constructor(
      readonly family: string,
      readonly source: string | ArrayBuffer,
    ) {}
    async load() {
      this.status = "loaded";
      return this;
    }
  }
  vi.stubGlobal("FontFace", Face);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { add: (face: FontFace) => loaded.add(face), delete: removed },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array(32))),
  );
  return { loaded, removed };
}
test("retains at most eight decoded ephemeral faces and disposes them without installing originals", async () => {
  const faces = nativeFaces(),
    install = vi.fn(),
    resolve = vi.fn();
  const cache = new FontSampleCache({ ...bundledFontLibrary, install, resolve });
  cache.resume();
  for (const font of FONT_CATALOG.slice(0, 12)) {
    let state: FontSampleState | undefined;
    const release = cache.acquire(font, true, (value) => {
      state = value;
    });
    await waitFor(() => expect(state?.status).toBe("ready"));
    expect(faces.loaded.size).toBeLessThanOrEqual(FONT_SAMPLE_LIMITS.faces);
    release();
  }
  expect(install).not.toHaveBeenCalled();
  expect(resolve).not.toHaveBeenCalled();
  cache.dispose();
  expect(faces.loaded.size).toBe(0);
  expect(faces.removed).toHaveBeenCalled();
});
test("aborts abandoned requests, starts only two jobs and never publishes a late decoded face", async () => {
  const faces = nativeFaces();
  const signals: AbortSignal[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal!;
          signals.push(signal);
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    ),
  );
  const cache = new FontSampleCache(bundledFontLibrary),
    listeners = FONT_CATALOG.slice(0, 5).map(() => vi.fn());
  cache.resume();
  const releases = FONT_CATALOG.slice(0, 5).map((font, index) =>
    cache.acquire(font, true, listeners[index]!),
  );
  expect(signals).toHaveLength(2);
  cache.pause();
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  for (const release of releases) release();
  await Promise.resolve();
  expect(faces.loaded.size).toBe(0);
  expect(
    listeners.every((listener) =>
      listener.mock.calls.every(([value]) => value.status === "loading"),
    ),
  ).toBe(true);
  cache.dispose();
});
test("uses native PostScript local sources and reads only already installed custom originals", async () => {
  nativeFaces();
  const resolve = vi.fn(async () => new ArrayBuffer(32)),
    cache = new FontSampleCache({ ...bundledFontLibrary, resolve });
  cache.resume();
  const local = vi.fn(),
    custom = vi.fn();
  const releaseLocal = cache.acquire(
    { id: "local:ExamplePS", family: "local:ExamplePS", category: "sans", source: "local" },
    false,
    local,
  );
  const releaseCustom = cache.acquire(
    { id: "custom:abc", family: "custom:abc", category: "sans", source: "user" },
    true,
    custom,
  );
  await waitFor(() =>
    expect(local).toHaveBeenLastCalledWith(expect.objectContaining({ status: "ready" })),
  );
  await waitFor(() =>
    expect(custom).toHaveBeenLastCalledWith(expect.objectContaining({ status: "ready" })),
  );
  expect(resolve).toHaveBeenCalledWith("custom:abc", 400, expect.any(AbortSignal));
  expect(fetch).not.toHaveBeenCalled();
  releaseLocal();
  releaseCustom();
  cache.dispose();
});
test("pause and resume restart a cancelled job for a still-mounted visible row", async () => {
  const faces = nativeFaces();
  let finish: ((response: Response) => void) | undefined;
  const fetcher = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        finish = resolve;
        init.signal!.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const cache = new FontSampleCache(bundledFontLibrary),
    listener = vi.fn();
  cache.resume();
  const release = cache.acquire(FONT_CATALOG[0]!, true, listener);
  expect(fetcher).toHaveBeenCalledOnce();
  cache.pause();
  cache.resume();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  finish?.(new Response(new Uint8Array(32)));
  await waitFor(() =>
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ status: "ready" })),
  );
  expect(faces.loaded.size).toBe(1);
  release();
  cache.dispose();
});

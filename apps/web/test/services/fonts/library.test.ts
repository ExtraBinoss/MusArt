import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openDB } from "idb";
import type { FontDefinition } from "@musart/assets";
import { FontLibrary } from "../../../src/services/fonts/library";
import {
  bytes,
  cleanup,
  count,
  fontFile,
  library,
  name,
  platform,
  record,
  store,
} from "./fixtures";

beforeEach(platform);
afterEach(cleanup);
const remote: FontDefinition = {
  id: "google:Aurora",
  family: "Aurora",
  category: "sans",
  source: "google",
  licenseURL: "https://raw.githubusercontent.com/google/fonts/revision/OFL.txt",
  variants: [
    {
      weight: 400,
      style: "normal",
      url: "https://raw.githubusercontent.com/google/fonts/revision/Aurora-Regular.ttf",
    },
    {
      weight: 700,
      style: "normal",
      url: "https://raw.githubusercontent.com/google/fonts/revision/Aurora-Bold.ttf",
    },
  ],
};
it("persists imported originals once by hash, exposes only metadata and restores them offline", async () => {
  const d = library(),
    changed = vi.fn(),
    stop = d.library.subscribe(changed);
  const first = await d.library.importFile(fontFile()),
    again = await d.library.importFile(fontFile("renamed.ttf"));
  expect(first).toEqual(again);
  expect(first).toMatchObject({
    family: expect.stringMatching(/^custom:[0-9a-f]{64}$/),
    label: expect.stringContaining("Test"),
    source: "user",
  });
  expect(await count(d.databaseName, "fontFiles")).toBe(1);
  expect(await count(d.databaseName, "fontFaces")).toBe(1);
  expect(changed).toHaveBeenCalledOnce();
  expect(d.persist).toHaveBeenCalledOnce();
  const gets = vi.spyOn(IDBObjectStore.prototype, "getAll");
  expect(await d.library.installed()).toEqual([first]);
  expect(gets.mock.contexts.map((value) => (value as IDBObjectStore).name)).toEqual(["fontFaces"]);
  expect(new Uint8Array(await d.library.resolve(first.family, 700))).toEqual(
    new Uint8Array(bytes()),
  );
  stop();
  d.library.dispose();
  const offline = library({
    databaseName: d.databaseName,
    fetch: vi.fn(() => Promise.reject(new Error("Offline"))),
  });
  expect(new Uint8Array(await offline.library.resolve(first.family, 400))).toEqual(
    new Uint8Array(bytes()),
  );
  expect(await offline.library.installed()).toEqual([first]);
  expect(offline.fetcher).not.toHaveBeenCalled();
});
it("loads the complete metadata catalog lazily and downloads only a requested Google variant", async () => {
  const catalog = vi.fn(async () => [remote, { ...remote, id: "google:Inter", family: "Inter" }]),
    d = library({ catalog });
  expect(d.fetcher).not.toHaveBeenCalled();
  const fonts = await d.library.catalog();
  expect(fonts.filter((font) => font.family === "Inter")).toHaveLength(1);
  expect(fonts.find((font) => font.family === "Aurora")).toEqual(remote);
  expect(await d.library.catalog()).toBe(fonts);
  expect(catalog).toHaveBeenCalledOnce();
  expect(d.fetcher).not.toHaveBeenCalled();
  await d.library.resolve("Aurora", 400);
  expect(d.fetcher).toHaveBeenCalledOnce();
  expect(d.fetcher).toHaveBeenCalledWith(remote.variants![0]!.url, {
    signal: expect.any(AbortSignal),
  });
  expect(d.persist).not.toHaveBeenCalled();
  await d.library.resolve("Aurora", 700);
  expect(d.fetcher).toHaveBeenCalledTimes(2);
  expect(d.fetcher).toHaveBeenLastCalledWith(remote.variants![1]!.url, {
    signal: expect.any(AbortSignal),
  });
  await d.library.resolve("Aurora", 500);
  expect(d.fetcher).toHaveBeenCalledTimes(2);
  expect(await count(d.databaseName, "fontFiles")).toBe(1);
  expect(await count(d.databaseName, "fontFaces")).toBe(3);
  expect(await d.library.install(remote, 700)).toMatchObject({
    id: remote.id,
    family: remote.family,
  });
  expect(d.persist).toHaveBeenCalledOnce();
});
it("shares one variable-font download across simultaneous requested weights and survives reopening offline", async () => {
  const variable = {
    ...remote,
    id: "google:Variable",
    family: "Variable",
    variants: [remote.variants![0]!],
  };
  const d = library({ catalog: async () => [variable] });
  await Promise.all([
    d.library.resolve("Variable", 400),
    d.library.resolve("Variable", 700),
    d.library.resolve("Variable", 500),
  ]);
  expect(d.fetcher).toHaveBeenCalledOnce();
  expect(await count(d.databaseName, "fontFaces")).toBe(3);
  d.library.dispose();
  const fetcher = vi.fn(() => Promise.reject(new Error("Offline"))),
    offline = library({
      databaseName: d.databaseName,
      fetch: fetcher,
      catalog: async () => {
        throw new Error("No catalog needed");
      },
    });
  expect((await offline.library.resolve("Variable", 700)).byteLength).toBe(bytes().byteLength);
  expect(fetcher).not.toHaveBeenCalled();
});
it("automatically discovers system metadata in the gesture and installs immutable canonical bytes for future sessions", async () => {
  const blob = vi.fn(async () => fontFile()),
    query = vi.fn(async () => [
      {
        family: "Test",
        fullName: "System Test Regular",
        postscriptName: "Test-Regular",
        style: "Regular",
        blob,
      },
    ]);
  const d = library({ queryLocalFonts: query }),
    pending = d.library.discoverLocal();
  expect(query).toHaveBeenCalledOnce();
  expect(blob).not.toHaveBeenCalled();
  const [local] = await pending;
  expect(d.library.supportsLocalFonts).toBe(true);
  const canonical = await d.library.install(local!, 700);
  expect(canonical.family).toMatch(/^custom:/);
  expect(blob).toHaveBeenCalledOnce();
  expect(await d.library.installed()).toEqual([canonical]);
  await d.library.resolve(local!.family, 700);
  await d.library.resolve(canonical.family, 700);
  expect(blob).toHaveBeenCalledOnce();
  d.library.dispose();
  const denied = vi.fn(() => Promise.reject(new Error("No OS permission"))),
    offline = library({ databaseName: d.databaseName, queryLocalFonts: denied });
  expect((await offline.library.resolve(local!.family, 700)).byteLength).toBe(bytes().byteLength);
  expect(denied).not.toHaveBeenCalled();
});
it("cancels an individual consumer while shared font work finishes for other consumers", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
    d = library({ catalog: async () => [remote], fetch: fetcher });
  const controller = new AbortController(),
    first = d.library.resolve("Aurora", 400, controller.signal),
    second = d.library.resolve("Aurora", 400);
  const cancelled = expect(first).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  controller.abort();
  await cancelled;
  finish(new Response(new Uint8Array(bytes())));
  expect((await second).byteLength).toBe(bytes().byteLength);
  expect(await count(d.databaseName, "fontFiles")).toBe(1);
});
it("rejects late downloads after disposal without writing or notifying subscribers", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
    d = library({ catalog: async () => [remote], fetch: fetcher }),
    changed = vi.fn();
  d.library.subscribe(changed);
  const pending = d.library.resolve("Aurora", 400),
    failed = expect(pending).rejects.toThrow();
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  d.library.dispose();
  finish(new Response(new Uint8Array(bytes())));
  await failed;
  expect(await count(d.databaseName, "fontFiles")).toBe(0);
  expect(await count(d.databaseName, "fontFaces")).toBe(0);
  expect(changed).not.toHaveBeenCalled();
  await expect(d.library.catalog()).rejects.toMatchObject({ code: "disposed" });
  await expect(d.library.installed()).rejects.toMatchObject({ code: "disposed" });
  expect(() => d.library.subscribe(changed)).toThrow("closed");
  expect(() => d.library.discoverLocal()).toThrow("closed");
  d.library.dispose();
});
it("retries genuine catalog/download failures and reports missing or invalid font data", async () => {
  const catalog = vi
      .fn()
      .mockRejectedValueOnce(new Error("catalog unavailable"))
      .mockResolvedValue([remote]),
    d = library({ catalog });
  await expect(d.library.catalog()).rejects.toThrow("catalog unavailable");
  await d.library.catalog();
  expect(catalog).toHaveBeenCalledTimes(2);
  d.fetcher.mockResolvedValueOnce(new Response("", { status: 404 }));
  await expect(d.library.resolve("Aurora", 400)).rejects.toMatchObject({ code: "download" });
  await d.library.resolve("Aurora", 400);
  expect(d.fetcher).toHaveBeenCalledTimes(2);
  await expect(d.library.resolve("custom:missing", 400)).rejects.toMatchObject({
    code: "notFound",
  });
  await expect(d.library.resolve("Unavailable family", 400)).rejects.toMatchObject({
    code: "notFound",
  });
  await expect(d.library.resolve("local:unavailable", 400)).rejects.toMatchObject({
    code: "notFound",
  });
  await expect(d.library.importFile(fontFile("font.woff2"))).rejects.toMatchObject({
    code: "unsupported",
  });
  await expect(d.library.importFile(new File(["bad-font"], "font.ttf"))).rejects.toMatchObject({
    code: "unsupported",
  });
  const unavailable = { ...remote, id: "google:Unavailable", family: "Unavailable", variants: [] };
  const noFile = library({ catalog: async () => [unavailable] });
  await expect(noFile.library.install(unavailable)).rejects.toMatchObject({ code: "notFound" });
});
it.each(["reject", "throw"])(
  "keeps committed imports durable when browser persistence permission %ss",
  async (failure) => {
    const persist = vi.fn(() => {
        if (failure === "throw") throw new Error("Unavailable");
        return Promise.reject(new Error("Denied"));
      }),
      d = library({ persist });
    const installed = await d.library.importFile(fontFile());
    expect(installed.family).toMatch(/^custom:/);
    await d.library.importFile(fontFile());
    expect(persist).toHaveBeenCalledOnce();
    expect(await count(d.databaseName, "fontFiles")).toBe(1);
  },
);
it("reports missing persisted originals and preserves the local bundled-family aliases", async () => {
  const prepared = store(),
    item = record();
  await prepared.store.save(item.file, [item.face]);
  const inspect = await openDB(prepared.databaseName);
  await inspect.delete("fontFiles", item.file.sha256);
  inspect.close();
  const orphan = library({ store: prepared.store, databaseName: prepared.databaseName });
  await expect(orphan.library.resolve("example", 400)).rejects.toMatchObject({ code: "notFound" });
  const fetcher = vi.fn(async () => new Response(new Uint8Array(bytes())));
  vi.stubGlobal("fetch", fetcher);
  const bundled = new FontLibrary({ databaseName: name(), catalog: async () => [] });
  await bundled.resolve("Arial", 400);
  await bundled.resolve("Georgia", 700);
  expect(fetcher).toHaveBeenCalledWith("/fonts/arimo/font.ttf", {
    signal: expect.any(AbortSignal),
  });
  expect(fetcher).toHaveBeenCalledWith("/fonts/tinos/bold.ttf", {
    signal: expect.any(AbortSignal),
  });
  bundled.dispose();
});
it("never commits an imported file whose read finishes after disposal", async () => {
  const d = library(),
    file = fontFile();
  let finish!: (value: ArrayBuffer) => void;
  Object.defineProperty(file, "arrayBuffer", {
    value: () =>
      new Promise<ArrayBuffer>((resolve) => {
        finish = resolve;
      }),
  });
  const pending = d.library.importFile(file),
    failed = expect(pending).rejects.toMatchObject({ code: "disposed" });
  d.library.dispose();
  finish(bytes());
  await failed;
  expect(await count(d.databaseName, "fontFiles")).toBe(0);
  expect(await count(d.databaseName, "fontFaces")).toBe(0);
});

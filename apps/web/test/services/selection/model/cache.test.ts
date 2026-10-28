import { afterEach, expect, test, vi } from "vitest";
import {
  inspectModelCache,
  removeModelCache,
  withModelCacheLock,
} from "../../../../src/services/selection/model/cache";
import {
  MODEL_CACHE,
  MODEL_ID,
  MODEL_REVISION,
  MODEL_FILES,
} from "../../../../src/services/selection/model/manifest";
function fixture() {
  const entries = new Map<string, Response>(),
    base = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/`;
  const cache = {
    keys: async () => [...entries.keys()].map((url) => new Request(url)),
    match: async (request: Request) => entries.get(request.url),
    delete: vi.fn(async (request: Request) => entries.delete(request.url)),
  };
  const storage = {
    has: vi.fn(async () => true),
    open: vi.fn(async () => cache),
  } as unknown as CacheStorage;
  return { entries, base, cache, storage };
}
afterEach(() => vi.unstubAllGlobals());
test("inspects declared model bytes without reading binary response bodies", async () => {
  const d = fixture();
  for (const [file, size] of Object.entries(MODEL_FILES))
    d.entries.set(d.base + file, new Response("", { headers: { "Content-Length": String(size) } }));
  d.entries.set("https://cdn.jsdelivr.net/runtime.wasm", new Response("unrelated"));
  const read = vi.spyOn(Response.prototype, "arrayBuffer");
  expect(await inspectModelCache(d.storage)).toEqual({
    available: true,
    bytes: 39834751,
    files: 4,
    supported: true,
  });
  expect(read).not.toHaveBeenCalled();
  expect(d.storage.open).toHaveBeenCalledWith(MODEL_CACHE);
  d.entries.set(d.base + "config.json", new Response(""));
  d.entries.set(d.base + "old.bin", new Response("", { headers: { "Content-Length": "bad" } }));
  d.entries.set(d.base + "missing.bin", new Response("", { status: 404 }));
  expect(await inspectModelCache(d.storage)).toMatchObject({ available: true, files: 5 });
});
test("removes only this model, preserving shared runtime and other models, and reports partial failures", async () => {
  const d = fixture();
  d.entries.set(d.base + "config.json", new Response(""));
  d.entries.set(
    `https://huggingface.co/${MODEL_ID}/resolve/old/config.json`,
    new Response("", { headers: { "Content-Length": "50" } }),
  );
  d.entries.set("https://cdn.jsdelivr.net/runtime.wasm", new Response(""));
  d.entries.set("https://huggingface.co/other/model/resolve/main/config.json", new Response(""));
  expect(await removeModelCache(d.storage)).toMatchObject({ files: 0, available: false });
  expect(d.entries.size).toBe(2);
  d.entries.set(d.base + "config.json", new Response(""));
  d.cache.delete.mockResolvedValue(false);
  await expect(removeModelCache(d.storage)).rejects.toThrow("could not be removed");
});
test("supports fresh or unavailable storage and propagates real access failures", async () => {
  vi.stubGlobal("caches", undefined);
  expect(await inspectModelCache()).toMatchObject({ supported: false });
  await expect(removeModelCache()).rejects.toThrow("unavailable");
  const d = fixture();
  vi.mocked(d.storage.has).mockResolvedValue(false);
  expect(await inspectModelCache(d.storage)).toMatchObject({
    available: false,
    files: 0,
    supported: true,
  });
  expect(await removeModelCache(d.storage)).toMatchObject({ files: 0 });
  expect(d.storage.open).not.toHaveBeenCalled();
  vi.mocked(d.storage.has).mockRejectedValue(new Error("denied"));
  await expect(inspectModelCache(d.storage)).rejects.toThrow("denied");
});
test("serializes cache operations with the real lock capability when available", async () => {
  const request = vi.fn(async (_name: string, work: () => Promise<number>) => work());
  vi.stubGlobal("navigator", { locks: { request } });
  expect(await withModelCacheLock(async () => 7)).toBe(7);
  expect(request).toHaveBeenCalledOnce();
});

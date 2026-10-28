import { MODEL_CACHE, MODEL_FILES, MODEL_LOCK, modelCachePath } from "./manifest";
import type { ModelCacheInfo } from "./contract";

export async function withModelCacheLock<T>(work: () => Promise<T>): Promise<T> {
  return typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request(MODEL_LOCK, work)
    : work();
}
const unavailable: ModelCacheInfo = Object.freeze({
  available: false,
  bytes: 0,
  files: 0,
  supported: false,
});
export async function inspectModelCache(
  storage: CacheStorage | undefined = globalThis.caches,
): Promise<ModelCacheInfo> {
  if (!storage) return unavailable;
  if (!(await storage.has(MODEL_CACHE))) return { ...unavailable, supported: true };
  const cache = await storage.open(MODEL_CACHE),
    required = new Set<string>();
  let bytes = 0,
    files = 0;
  for (const request of await cache.keys()) {
    const path = modelCachePath(request.url);
    if (!path) continue;
    const response = await cache.match(request);
    if (!response?.ok) continue;
    files++;
    const length = Number(response.headers.get("Content-Length"));
    bytes +=
      Number.isSafeInteger(length) && length > 0
        ? length
        : path.current
          ? (MODEL_FILES[path.file] ?? 0)
          : 0;
    if (path.current && Object.hasOwn(MODEL_FILES, path.file)) required.add(path.file);
  }
  return {
    available: required.size === Object.keys(MODEL_FILES).length,
    bytes,
    files,
    supported: true,
  };
}
/** Only this model's resources are removed; shared ORT runtime and other models survive. */
export async function removeModelCache(
  storage: CacheStorage | undefined = globalThis.caches,
): Promise<ModelCacheInfo> {
  if (!storage) throw new Error("Browser model storage is unavailable.");
  return withModelCacheLock(async () => {
    if (await storage.has(MODEL_CACHE)) {
      const cache = await storage.open(MODEL_CACHE);
      for (const request of await cache.keys())
        if (modelCachePath(request.url)) await cache.delete(request);
    }
    const result = await inspectModelCache(storage);
    if (result.files) throw new Error("Some model files could not be removed. Please try again.");
    return result;
  });
}

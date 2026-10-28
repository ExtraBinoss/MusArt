import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThumbnailUrls } from "../../../../src/services/projects/thumbnails/urls";
import { record } from "./fixtures";
beforeEach(() => {
  let next = 0;
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => `blob:${++next}`);
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
it("labels historical reads explicitly without changing the same blob's later current status", () => {
  const cache = new ThumbnailUrls(),
    value = record(),
    old = cache.acquire([{ ...value, stale: true }]),
    current = cache.acquire([value]);
  expect(old.items[0]).toMatchObject({ stale: true, revision: value.revision });
  expect(current.items[0]).not.toHaveProperty("stale");
  expect(old.items[0]!.url).toBe(current.items[0]!.url);
  expect(value).not.toHaveProperty("stale");
  old.release();
  current.release();
  cache.dispose();
});
it("reuses versioned URLs and keeps active leases valid even if they exceed the inactive cache budget", () => {
  const cache = new ThumbnailUrls(1, 1),
    first = cache.acquire([record()]),
    second = cache.acquire([record()]);
  expect(first.items[0]!.url).toBe(second.items[0]!.url);
  expect(cache.stats()).toMatchObject({ entries: 1, leases: 2 });
  cache.invalidate("project", "page", "next");
  first.release();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  second.release();
  second.release();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  expect(cache.stats().entries).toBe(0);
  cache.dispose();
  expect(() => cache.acquire([])).toThrow("closed");
});
it("evicts oldest unused entries, invalidates deleted projects and revokes every remaining URL on close", () => {
  const cache = new ThumbnailUrls(1, 1000),
    first = cache.acquire([record()]);
  first.release();
  const second = cache.acquire([record({ pageId: "other", revision: "two" })]);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(first.items[0]!.url);
  cache.invalidate("different");
  expect(cache.stats().entries).toBe(1);
  cache.invalidate("project");
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  second.release();
  expect(cache.stats().entries).toBe(0);
  cache.acquire([record()]);
  cache.dispose();
  cache.dispose();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
});

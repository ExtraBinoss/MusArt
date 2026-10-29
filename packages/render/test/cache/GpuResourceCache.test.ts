import { describe, expect, it, vi } from "vitest";
import { GpuResourceCache } from "../../src/cache/GpuResourceCache";
const resource = (bytes: number, targets = 0) => ({ bytes, targets, dispose: vi.fn() });
describe("GPU allocation budget", () => {
  it("pins frame resources, evicts old LRU resources and tracks actual bytes", () => {
    const cache = new GpuResourceCache(100);
    const a = resource(40, 1);
    const b = resource(40, 2);
    const c = resource(40, 3);
    cache.set("a", a);
    cache.set("b", b);
    cache.beginFrame();
    expect(cache.get("a")).toBe(a);
    cache.set("c", c);
    expect(b.dispose).toHaveBeenCalledOnce();
    expect(cache.get("b")).toBeUndefined();
    expect(cache.stats()).toEqual({ cacheBytes: 80, targets: 4, entries: 2, maxBytes: 100 });
    cache.clear();
    expect(a.dispose).toHaveBeenCalledOnce();
    expect(c.dispose).toHaveBeenCalledOnce();
    expect(cache.stats().cacheBytes).toBe(0);
  });
  it("retains the displayed root, replaces ownership and rejects impossible live budgets", () => {
    const cache = new GpuResourceCache(100);
    const root = resource(70);
    cache.set("root", root);
    cache.beginFrame("root");
    expect(() => cache.set("huge", resource(50))).toThrow("Budget");
    expect(root.dispose).not.toHaveBeenCalled();
    const replacement = resource(40);
    cache.set("root", replacement);
    expect(root.dispose).toHaveBeenCalledOnce();
    replacement.bytes = 60;
    cache.synchronize("root");
    expect(cache.stats().cacheBytes).toBe(60);
    cache.synchronize("missing");
    cache.clear();
  });
  it("preflights buffer growth without disposing a displayed allocation", () => {
    const cache = new GpuResourceCache(100);
    const displayed = resource(40, 1);
    cache.set("displayed", displayed);
    expect(() => cache.ensureCapacity("displayed", 120)).toThrow("Budget");
    expect(displayed.dispose).not.toHaveBeenCalled();
    expect(cache.stats().cacheBytes).toBe(40);
    cache.ensureCapacity("new", 20);
    cache.clear();
  });
  it("uses a bounded default budget", () =>
    expect(new GpuResourceCache().stats().maxBytes).toBe(384 * 1024 * 1024));
});
it("accounts non-evictable in-flight texture reservations until their actual owner releases them", () => {
  const cache = new GpuResourceCache(100),
    displayed = resource(50),
    old = resource(30);
  cache.set("displayed", displayed);
  cache.set("old", old);
  cache.beginFrame("displayed");
  cache.reserveExternal("native-video", 40);
  expect(old.dispose).toHaveBeenCalledTimes(1);
  expect(cache.stats().cacheBytes).toBe(90);
  expect(() => cache.ensureCapacity("displayed", 70)).toThrow("Budget");
  expect(() => cache.reserveExternal("native-video", 60)).toThrow("Budget");
  expect(cache.stats().cacheBytes).toBe(90);
  expect(() => cache.clear()).toThrow("external");
  cache.reserveExternal("native-video", 0);
  cache.clear();
  expect(cache.stats().cacheBytes).toBe(0);
  for (const bytes of [-1, NaN, 1.5])
    expect(() => cache.reserveExternal("video", bytes)).toThrow("Invalid");
});

import { afterEach, expect, test, vi } from "vitest";
import { browserSearchTiming, SearchOpenTiming } from "../../../src/components/search/open-timing";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function clock() {
  let now = 0,
    id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  return {
    now: () => now,
    request: (callback: FrameRequestCallback) => {
      frames.set(++id, callback);
      return id;
    },
    cancel: (handle: number) => {
      frames.delete(handle);
    },
    frames,
    advance: () => {
      now += 16;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(now));
    },
  };
}
test("measures a bounded actual-paint interval over two frames and cancels stale/repeated requests", () => {
  const c = clock(),
    timing = new SearchOpenTiming(c),
    report = vi.fn();
  timing.mounted(report);
  expect(c.frames.size).toBe(0);
  timing.request();
  timing.mounted(report);
  timing.mounted(report);
  expect(c.frames.size).toBe(1);
  c.advance();
  expect(report).not.toHaveBeenCalled();
  c.advance();
  expect(report).toHaveBeenCalledExactlyOnceWith(32);
  timing.request();
  timing.mounted(report);
  const stale = [...c.frames.values()][0]!;
  timing.request();
  timing.mounted(report);
  stale(100);
  expect(c.frames.size).toBe(1);
  timing.cancel();
  c.advance();
  expect(report).toHaveBeenCalledOnce();
  timing.request();
  timing.mounted(report);
  c.advance();
  const staleInner = [...c.frames.values()][0]!;
  timing.request();
  timing.mounted(report);
  staleInner(120);
  expect(c.frames.size).toBe(1);
  timing.cancel();
  expect(c.frames.size).toBe(0);
});
test("uses cancellable browser frame APIs and a deterministic timeout fallback when frames are unavailable", () => {
  vi.useFakeTimers();
  const report = vi.fn(),
    native = browserSearchTiming();
  native.request();
  native.mounted(report);
  native.cancel();
  vi.stubGlobal("requestAnimationFrame", undefined);
  const fallback = browserSearchTiming();
  fallback.request();
  fallback.mounted(report);
  vi.runAllTimers();
  expect(report).toHaveBeenCalledOnce();
  fallback.request();
  fallback.mounted(report);
  fallback.cancel();
  expect(vi.getTimerCount()).toBe(0);
});

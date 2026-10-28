import { afterEach, expect, test, vi } from "vitest";
import { scheduleLayerThumbnail } from "../../../../src/components/layers/rows/thumbnail-idle";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
test("visible rows share one idle callback, yield when the deadline/input budget is exhausted, and cancel individually", () => {
  const callbacks: IdleRequestCallback[] = [],
    request = vi.fn((callback: IdleRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    }),
    cancel = vi.fn();
  vi.stubGlobal("requestIdleCallback", request);
  vi.stubGlobal("cancelIdleCallback", cancel);
  const first = vi.fn(),
    second = vi.fn(),
    stopFirst = scheduleLayerThumbnail(first),
    stopSecond = scheduleLayerThumbnail(second);
  expect(request).toHaveBeenCalledOnce();
  callbacks[0]!({ timeRemaining: () => 0 } as IdleDeadline);
  expect(first).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledTimes(2);
  stopFirst();
  callbacks[1]!({ timeRemaining: () => 10 } as IdleDeadline);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
  stopSecond();
  expect(request).toHaveBeenCalledTimes(2);
  const stop = scheduleLayerThumbnail(first);
  stop();
  expect(cancel).toHaveBeenCalled();
});
test("fallback timers prepare at most one row per frame and hidden documents resume without polling", () => {
  vi.useFakeTimers();
  vi.stubGlobal("requestIdleCallback", undefined);
  const first = vi.fn(),
    second = vi.fn();
  const a = scheduleLayerThumbnail(first),
    b = scheduleLayerThumbnail(second);
  vi.advanceTimersByTime(15);
  expect(first).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(first).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
  vi.advanceTimersByTime(16);
  expect(second).toHaveBeenCalledOnce();
  a();
  b();
  const visibility = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  const stop = scheduleLayerThumbnail(first);
  vi.advanceTimersByTime(1000);
  expect(first).toHaveBeenCalledOnce();
  visibility.mockReturnValue(false);
  document.dispatchEvent(new Event("visibilitychange"));
  vi.advanceTimersByTime(16);
  expect(first).toHaveBeenCalledTimes(2);
  stop();
});

test("native pending input defers preparation until its next idle slot", () => {
  const callbacks: IdleRequestCallback[] = [];
  vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  const busy = vi.fn(() => true);
  vi.stubGlobal("navigator", { scheduling: { isInputPending: busy } });
  const task = vi.fn(),
    stop = scheduleLayerThumbnail(task);
  callbacks[0]!({ timeRemaining: () => 10 } as IdleDeadline);
  expect(task).not.toHaveBeenCalled();
  busy.mockReturnValue(false);
  callbacks[1]!({ timeRemaining: () => 10 } as IdleDeadline);
  expect(task).toHaveBeenCalledOnce();
  stop();
});

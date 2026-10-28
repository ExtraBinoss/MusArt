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

test("awaits the owned request before admitting another row, preventing preview-capacity eviction", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("requestIdleCallback", undefined);
  let resolve!: () => void;
  const first = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const rest = Array.from({ length: 40 }, () => vi.fn());
  const stops = [
    scheduleLayerThumbnail(first),
    ...rest.map((task) => scheduleLayerThumbnail(task)),
  ];
  await vi.advanceTimersByTimeAsync(16);
  expect(first).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1000);
  expect(rest.every((task) => !task.mock.calls.length)).toBe(true);
  resolve();
  await vi.advanceTimersByTimeAsync(16);
  expect(rest[0]).toHaveBeenCalledOnce();
  expect(rest[1]).not.toHaveBeenCalled();
  for (const stop of stops) stop();
});
test("a rejected owned request releases admission and canceled pending rows never run", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("requestIdleCallback", undefined);
  let reject!: (error: Error) => void;
  const a = scheduleLayerThumbnail(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      }),
  );
  const next = vi.fn(),
    skipped = vi.fn(),
    b = scheduleLayerThumbnail(next),
    c = scheduleLayerThumbnail(skipped);
  await vi.advanceTimersByTimeAsync(16);
  c();
  reject(Error("real preview failure"));
  await vi.advanceTimersByTimeAsync(16);
  expect(next).toHaveBeenCalledOnce();
  expect(skipped).not.toHaveBeenCalled();
  a();
  b();
});

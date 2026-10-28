import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { scheduleLayerThumbnail } from "../../../../src/components/layers/rows/thumbnail-idle";
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("scheduler", undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
test("visible rows share a cancellable task and cached rows do not wait for idle callbacks", async () => {
  const callbacks: (() => void)[] = [];
  const postTask = vi.fn(
    (task: () => void, options: { signal: AbortSignal }) =>
      new Promise<void>((resolve, reject) => {
        callbacks.push(() => {
          task();
          resolve();
        });
        options.signal.addEventListener("abort", () => reject(options.signal.reason), {
          once: true,
        });
      }),
  );
  vi.stubGlobal("scheduler", { postTask });
  const idle = vi.fn();
  vi.stubGlobal("requestIdleCallback", idle);
  const first = vi.fn(),
    second = vi.fn();
  const stopFirst = scheduleLayerThumbnail(first),
    stopSecond = scheduleLayerThumbnail(second);
  expect(postTask).toHaveBeenCalledOnce();
  expect(postTask.mock.calls[0]![1]).toMatchObject({ priority: "user-visible" });
  expect(idle).not.toHaveBeenCalled();
  stopFirst();
  callbacks[0]!();
  await vi.runAllTimersAsync();
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
  stopSecond();
  const canceled = vi.fn(),
    stop = scheduleLayerThumbnail(canceled);
  const signal = postTask.mock.calls.at(-1)![1].signal;
  stop();
  expect(signal.aborted).toBe(true);
  callbacks.at(-1)!();
  await vi.runAllTimersAsync();
  expect(canceled).not.toHaveBeenCalled();
});
test("hidden documents resume on visibility without polling or leaking admission tasks", async () => {
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  const run = vi.fn(),
    stop = scheduleLayerThumbnail(run);
  await vi.runAllTimersAsync();
  expect(vi.getTimerCount()).toBe(0);
  expect(run).not.toHaveBeenCalled();
  hidden.mockReturnValue(false);
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.runAllTimersAsync();
  expect(run).toHaveBeenCalledOnce();
  stop();
  const delayed = vi.fn(),
    stopDelayed = scheduleLayerThumbnail(delayed);
  hidden.mockReturnValue(true);
  await vi.runAllTimersAsync();
  expect(delayed).not.toHaveBeenCalled();
  hidden.mockReturnValue(false);
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.runAllTimersAsync();
  expect(delayed).toHaveBeenCalledOnce();
  stopDelayed();
});
test("cancellation after task admission still prevents an unstarted request microtask", async () => {
  const second = vi.fn();
  const stopFirst = scheduleLayerThumbnail(() => stopSecond());
  const stopSecond = scheduleLayerThumbnail(second);
  await vi.runAllTimersAsync();
  expect(second).not.toHaveBeenCalled();
  stopFirst();
  stopSecond();
});
test("one cold request never blocks cached rows, while at most four requests own pipeline slots", async () => {
  const done: (() => void)[] = [];
  const held = Array.from({ length: 4 }, () =>
    vi.fn(() => new Promise<void>((resolve) => done.push(resolve))),
  );
  const rest = Array.from({ length: 40 }, () => vi.fn());
  const stops = [...held, ...rest].map(scheduleLayerThumbnail);
  await vi.runAllTimersAsync();
  expect(held.every((task) => task.mock.calls.length === 1)).toBe(true);
  expect(rest.every((task) => !task.mock.calls.length)).toBe(true);
  done[1]!();
  await vi.runAllTimersAsync();
  expect(rest.every((task) => task.mock.calls.length === 1)).toBe(true);
  expect(done).toHaveLength(4);
  done[0]!();
  done[2]!();
  done[3]!();
  await vi.runAllTimersAsync();
  stops.forEach((stop) => stop());
  expect(vi.getTimerCount()).toBe(0);
});
test("failed owned requests release admission and canceled pending rows never run", async () => {
  const reject: ((error: Error) => void)[] = [];
  const held = Array.from(
    { length: 4 },
    () => () => new Promise<void>((_resolve, fail) => reject.push(fail)),
  );
  const stops = held.map(scheduleLayerThumbnail);
  const next = vi.fn(),
    skipped = vi.fn(),
    throws = vi.fn(() => {
      throw Error("preparation failed");
    });
  stops.push(scheduleLayerThumbnail(next), scheduleLayerThumbnail(throws));
  const cancel = scheduleLayerThumbnail(skipped);
  await vi.runAllTimersAsync();
  cancel();
  reject[0]!(Error("real preview failure"));
  await vi.runAllTimersAsync();
  expect(next).toHaveBeenCalledOnce();
  expect(throws).toHaveBeenCalledOnce();
  expect(skipped).not.toHaveBeenCalled();
  reject.slice(1).forEach((fail) => fail(Error("closing")));
  await vi.runAllTimersAsync();
  stops.forEach((stop) => stop());
});

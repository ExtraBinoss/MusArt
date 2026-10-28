import { afterEach, expect, it, vi } from "vitest";
import { yieldFragmentTask } from "../../../../src/services/serialization/fragments/task-yield";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("uses a background scheduler task with the original abort signal", async () => {
  const signal = new AbortController().signal,
    postTask = vi.fn(async (callback: () => void) => callback());
  vi.stubGlobal("scheduler", { postTask });
  await yieldFragmentTask(signal);
  expect(postTask).toHaveBeenCalledWith(expect.any(Function), { priority: "background", signal });
  await yieldFragmentTask(signal, true);
  expect(postTask).toHaveBeenLastCalledWith(expect.any(Function), {
    priority: "user-visible",
    signal,
  });
});
it("falls back to an abortable task and removes timers/listeners", async () => {
  vi.stubGlobal("scheduler", undefined);
  vi.useFakeTimers();
  const controller = new AbortController(),
    task = yieldFragmentTask(controller.signal),
    reason = new Error("closed");
  const rejected = expect(task).rejects.toBe(reason);
  controller.abort(reason);
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
  await expect(yieldFragmentTask(controller.signal)).rejects.toBe(reason);
  const ready = yieldFragmentTask(new AbortController().signal);
  await vi.runAllTimersAsync();
  await ready;
  expect(vi.getTimerCount()).toBe(0);
});

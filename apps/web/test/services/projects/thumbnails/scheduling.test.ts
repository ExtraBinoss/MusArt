import { afterEach, expect, it, vi } from "vitest";
import {
  hasThumbnailBudget,
  yieldThumbnailInput,
} from "../../../../src/services/projects/thumbnails/scheduling";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("uses real idle budget and refuses timeout callbacks that have no frame time left", () => {
  expect(hasThumbnailBudget()).toBe(true);
  expect(hasThumbnailBudget({ didTimeout: true, timeRemaining: () => 0 })).toBe(false);
  expect(hasThumbnailBudget({ didTimeout: false, timeRemaining: () => 7.9 })).toBe(false);
  expect(hasThumbnailBudget({ didTimeout: false, timeRemaining: () => 8 })).toBe(true);
});
it("lets native scheduling run queued input before encoding and forwards abort ownership", async () => {
  const postTask = vi.fn(async (task: () => void) => task());
  vi.stubGlobal("scheduler", { postTask });
  const controller = new AbortController();
  await yieldThumbnailInput(controller.signal);
  expect(postTask).toHaveBeenCalledWith(expect.any(Function), {
    priority: "user-visible",
    signal: controller.signal,
  });
  controller.abort();
  expect(() => yieldThumbnailInput(controller.signal)).toThrow();
});
it("falls back to one cancellable timer, releases its listener and never leaks a timeout", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("scheduler", undefined);
  const controller = new AbortController(),
    remove = vi.spyOn(controller.signal, "removeEventListener");
  const yielded = yieldThumbnailInput(controller.signal);
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(0);
  await yielded;
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
  const pending = yieldThumbnailInput(controller.signal),
    rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});

import { afterEach, expect, test, vi } from "vitest";
import { PaintYield } from "../../../src/services/animation/paint-yield";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("yields two presentation frames and a task, then removes its timer and visibility listener", async () => {
  vi.useFakeTimers();
  const callbacks: FrameRequestCallback[] = [],
    cancel = vi.fn();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    }),
  );
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const remove = vi.spyOn(document, "removeEventListener");
  const gate = new PaintYield(),
    done = vi.fn();
  const pending = gate.wait().then(done);
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();
  callbacks[0]!(0);
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();
  callbacks[1]!(16);
  await Promise.resolve();
  expect(done).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(0);
  await pending;
  expect(done).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  expect(cancel).not.toHaveBeenCalled();
  gate.release();
});

test("explicit flush, visibility suspension and stalled animation frames always drain and clean up", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 42),
  );
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const gate = new PaintYield(),
    first = gate.wait();
  gate.release();
  await first;
  expect(cancel).toHaveBeenCalledWith(42);
  expect(vi.getTimerCount()).toBe(0);
  const second = gate.wait();
  await vi.advanceTimersByTimeAsync(250);
  await second;
  const third = gate.wait();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  await third;
  const fourth = gate.wait();
  await vi.advanceTimersByTimeAsync(0);
  await fourth;
  expect(vi.getTimerCount()).toBe(0);
});

test("no-window runtimes use a bounded task without installing a visibility listener", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", undefined);
  vi.stubGlobal("document", undefined);
  const pending = new PaintYield().wait();
  await vi.advanceTimersByTimeAsync(0);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});

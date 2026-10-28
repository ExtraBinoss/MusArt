import { afterEach, expect, test, vi } from "vitest";
import { PaintYield } from "../../../src/services/animation/paint-yield";
import { CanonicalPresentation } from "../../../src/state/session/canonical-presentation";
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

test("waits for the useful canonical draw instead of arbitrary frames and rechecks newer preview requests", async () => {
  vi.useFakeTimers();
  const frames = new Map<number, FrameRequestCallback>();
  let serial = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++serial, callback);
    return serial;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
  const draw = () => {
    const [id, callback] = [...frames][0]!;
    frames.delete(id);
    callback(0);
  };
  const port = new CanonicalPresentation(),
    publisher = port.acquire(),
    origin = { projectId: "A", revision: 1 },
    ticket = publisher.request(origin, true),
    gate = new PaintYield(port),
    done = vi.fn(),
    pending = gate.wait(origin).then(done);
  await vi.advanceTimersByTimeAsync(1000);
  expect(done).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
  publisher.present(ticket);
  draw();
  // A newer transient frame before the post-paint task invalidates the older canonical signal.
  publisher.request(origin, false);
  await vi.advanceTimersByTimeAsync(0);
  expect(done).not.toHaveBeenCalled();
  const latest = publisher.request(origin, true);
  publisher.present(latest);
  draw();
  expect(done).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(0);
  await pending;
  expect(done).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  expect(frames.size).toBe(0);
  publisher.request({ projectId: "A", revision: 2 }, true);
  expect(frames.size).toBe(0);
  publisher.release();
});

test("allows a newer project's useful frame to release old work and flushes even without a frame", async () => {
  vi.useFakeTimers();
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const port = new CanonicalPresentation(),
    publisher = port.acquire(),
    gate = new PaintYield(port),
    old = { projectId: "A", revision: 1 };
  publisher.request(old, true);
  const pending = gate.wait(old),
    newer = publisher.request({ projectId: "B", revision: 2 }, true);
  publisher.present(newer);
  callbacks.at(-1)!(0);
  await vi.advanceTimersByTimeAsync(0);
  await pending;
  publisher.request({ projectId: "B", revision: 3 }, true);
  const forced = gate.wait({ projectId: "B", revision: 3 });
  gate.release();
  await forced;
  expect(vi.getTimerCount()).toBe(0);
  const failed = gate.wait({ projectId: "B", revision: 3 });
  publisher.unavailable();
  await vi.advanceTimersByTimeAsync(250);
  await failed;
  expect(vi.getTimerCount()).toBe(0);
  publisher.release();
});

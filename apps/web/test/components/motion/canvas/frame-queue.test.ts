import { expect, it, vi } from "vitest";
import { createTimelineCanvasFrameQueue } from "../../../../src/components/motion/canvas/frame-queue";

function fixture() {
  let next = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const queue = createTimelineCanvasFrameQueue({
    request: (callback) => {
      callbacks.set(++next, callback);
      return next;
    },
    cancel: (id) => {
      callbacks.delete(id);
    },
  });
  const flush = () => {
    const entry = callbacks.entries().next().value;
    if (!entry) throw new Error("No pending frame");
    callbacks.delete(entry[0]);
    entry[1](0);
  };
  return { queue, callbacks, flush };
}
it("coalesces invalidations and performs measured work before paint without an idle loop", () => {
  const d = fixture(),
    order: string[] = [];
  const paint = () => order.push("paint");
  d.queue.request("paint", paint);
  d.queue.request("paint", paint);
  d.queue.request("measure", () => {
    order.push("measure");
    d.queue.request("paint", paint);
  });
  expect(d.callbacks.size).toBe(1);
  d.flush();
  expect(order).toEqual(["measure", "paint"]);
  expect(d.callbacks.size).toBe(0);
});
it("cancels disposed work and preserves failures without abandoning another callback", () => {
  const d = fixture(),
    other = vi.fn();
  d.queue.request("measure", () => {
    throw new Error("measure failed");
  });
  d.queue.request("paint", other);
  expect(d.flush).toThrow(AggregateError);
  expect(other).toHaveBeenCalledOnce();
  const cancel = d.queue.request("paint", other);
  cancel();
  expect(d.callbacks.size).toBe(0);
  d.queue.request("paint", other);
  d.queue.dispose();
  d.queue.request("paint", other);
  expect(d.callbacks.size).toBe(0);
});

it("defers work requested while painting to exactly one later frame", () => {
  const d = fixture();
  let painted = 0;
  const draw = () => {
    painted++;
    if (painted < 2) d.queue.request("paint", draw);
  };
  d.queue.request("paint", draw);
  d.flush();
  expect(painted).toBe(1);
  expect(d.callbacks.size).toBe(1);
  d.flush();
  expect(painted).toBe(2);
  expect(d.callbacks.size).toBe(0);
});

it("flushes a layout publication before presentation and retires its pending RAF", () => {
  const d = fixture(),
    order: string[] = [];
  d.queue.request("paint", () => {
    order.push("paint");
    d.queue.flush(); // Nested flush cannot reenter either phase.
  });
  d.queue.request("measure", () => order.push("measure"));
  d.queue.flush();
  expect(order).toEqual(["measure", "paint"]);
  expect(d.callbacks.size).toBe(0);
  d.queue.flush();
  expect(order).toHaveLength(2);
  d.queue.dispose();
  d.queue.flush();
  expect(d.callbacks.size).toBe(0);
});

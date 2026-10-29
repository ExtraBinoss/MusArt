import { expect, it, vi } from "vitest";
import { ViewMotion, interpolateView } from "../../../src/canvas/viewport/motion";
import { INITIAL_VIEW, constrainView, zoomAt, type View } from "../../../src/canvas/viewport/view";
function fixture(reduced = false, duration?: number, constrain = (view: View) => view) {
  let time = 0,
    next = 1;
  const frames = new Map<number, FrameRequestCallback>();
  const clock = {
    now: () => time,
    request: (callback: FrameRequestCallback) => {
      const id = next++;
      frames.set(id, callback);
      return id;
    },
    cancel: vi.fn((id: number) => {
      frames.delete(id);
    }),
  };
  const preference = { reduced };
  const motion = new ViewMotion({ clock, constrain, duration, reduced: () => preference.reduced });
  const advance = (to: number) => {
    time = to;
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(time);
  };
  return { motion, frames, clock, preference, advance };
}
it("animates monotonically without overshoot, preserves the zoom anchor and publishes React only once", () => {
  const d = fixture(),
    poses: View[] = [],
    settled = vi.fn(),
    anchor = { x: 120, y: -70 };
  d.motion.subscribe(() => poses.push(d.motion.read()));
  d.motion.subscribeSettled(settled);
  d.motion.zoomBy(1.2, anchor);
  expect(d.motion.read()).toEqual(INITIAL_VIEW);
  for (const time of [0, 16, 32, 64, 96, 128, 159]) {
    d.advance(time);
    expect(d.motion.readSettled()).toEqual(INITIAL_VIEW);
  }
  d.advance(160);
  expect(d.motion.read()).toEqual(zoomAt(INITIAL_VIEW, 1.2, anchor));
  expect(settled).toHaveBeenCalledOnce();
  expect(d.frames.size).toBe(0);
  poses.forEach((pose, index) => {
    expect(pose.zoom).toBeGreaterThanOrEqual(index ? poses[index - 1]!.zoom : 1);
    expect(pose.zoom).toBeLessThanOrEqual(1.2);
    expect((anchor.x - pose.x) / pose.zoom).toBeCloseTo(anchor.x, 10);
    expect((anchor.y - pose.y) / pose.zoom).toBeCloseTo(anchor.y, 10);
  });
});
it("retargets rapid wheel input continuously and reverses direction immediately", () => {
  const d = fixture();
  d.motion.zoomBy(1.2, { x: 80, y: 40 });
  d.advance(40);
  const before = d.motion.read();
  d.motion.zoomBy(1.2, { x: 80, y: 40 });
  expect(d.motion.read()).toEqual(before);
  d.advance(200);
  expect(d.motion.read().zoom).toBeCloseTo(1.44);
  d.motion.zoomBy(1.2, { x: 80, y: 40 });
  d.advance(240);
  const turning = d.motion.read().zoom;
  d.motion.zoomBy(1 / 1.2, { x: 80, y: 40 });
  d.advance(256);
  expect(d.motion.read().zoom).toBeLessThan(turning);
  d.advance(400);
  expect(d.motion.read().zoom).toBeCloseTo(turning / 1.2);
});
it("cancels, finishes and disposes all scheduled work, including a StrictMode-style reactivation", () => {
  const d = fixture(),
    listener = vi.fn(),
    settled = vi.fn();
  const stop = d.motion.subscribe(listener),
    stopSettled = d.motion.subscribeSettled(settled);
  d.motion.zoomBy(2, { x: 0, y: 0 });
  d.advance(40);
  d.motion.stop();
  const interrupted = d.motion.read();
  d.advance(500);
  expect(d.motion.read()).toBe(interrupted);
  expect(d.frames.size).toBe(0);
  d.motion.animateTo({ x: 0, y: 0, zoom: 1 });
  d.motion.finish();
  expect(d.motion.read()).toEqual(INITIAL_VIEW);
  d.motion.finish();
  d.motion.jump(INITIAL_VIEW);
  stop();
  stopSettled();
  const count = listener.mock.calls.length;
  d.motion.animateTo({ x: 100, y: -100, zoom: 2 });
  d.motion.dispose();
  d.advance(1000);
  d.motion.jump({ x: 1, y: 1, zoom: 1 });
  d.motion.zoomBy(2, { x: 0, y: 0 });
  d.motion.animateTo(INITIAL_VIEW);
  expect(d.frames.size).toBe(0);
  expect(listener).toHaveBeenCalledTimes(count);
  d.motion.activate();
  d.motion.jump(INITIAL_VIEW);
  expect(d.motion.read()).toEqual(INITIAL_VIEW);
});
it("uses instant reduced motion, handles preference changes and bounds each pose", () => {
  const bound = (view: View) =>
    constrainView(view, { width: 200, height: 160 }, { width: 1000, height: 800 });
  const d = fixture(true, undefined, bound);
  d.motion.animateTo({ x: 10000, y: -10000, zoom: 1 });
  expect(d.motion.read()).toEqual({ x: 240, y: -240, zoom: 1 });
  expect(d.frames.size).toBe(0);
  d.preference.reduced = false;
  d.motion.zoomBy(2, { x: 1000, y: 1000 });
  d.advance(40);
  d.preference.reduced = true;
  d.advance(56);
  expect(d.frames.size).toBe(0);
  expect(d.motion.read().zoom).toBe(2);
  expect(Math.abs(d.motion.read().x)).toBeLessThanOrEqual(240);
  for (const factor of [0, -1, NaN, Infinity, 1]) d.motion.zoomBy(factor, { x: 0, y: 0 });
  expect(d.frames.size).toBe(0);
  const instant = fixture(false, 0);
  instant.motion.zoomBy(2, { x: 0, y: 0 });
  expect(instant.motion.read().zoom).toBe(2);
});
it("interpolates pure pan and exact endpoints without introducing a scale drift", () => {
  const target = { x: 100, y: -50, zoom: 1 };
  expect(interpolateView(INITIAL_VIEW, target, -1)).toBe(INITIAL_VIEW);
  expect(interpolateView(INITIAL_VIEW, target, 2)).toBe(target);
  expect(interpolateView(INITIAL_VIEW, target, 0.5)).toEqual({ x: 87.5, y: -43.75, zoom: 1 });
});
it.each(["dispose", "stop"] as const)(
  "does not reschedule a frame after a subscriber calls %s",
  (method) => {
    const d = fixture();
    d.motion.subscribe(() => {
      if (d.motion.read().zoom > 1) d.motion[method]();
    });
    d.motion.zoomBy(2, { x: 0, y: 0 });
    d.advance(40);
    expect(d.frames.size).toBe(0);
  },
);
it("keeps exactly one tracked frame when a subscriber retargets an active animation", () => {
  const d = fixture();
  let retargeted = false;
  d.motion.subscribe(() => {
    if (!retargeted && d.motion.read().zoom > 1) {
      retargeted = true;
      d.motion.zoomBy(1.1, { x: 10, y: 20 });
    }
  });
  d.motion.zoomBy(2, { x: 0, y: 0 });
  d.advance(40);
  expect(d.frames.size).toBe(1);
  d.advance(200);
  expect(d.frames.size).toBe(0);
  expect(d.motion.read().zoom).toBeCloseTo(2.2);
});

it("rebases a viewport origin without clamping its first screen pose or publishing per-frame settled views", () => {
  const constrain = vi.fn((view: View) => ({ ...view, y: Math.min(20, view.y) }));
  const d = fixture(false, undefined, constrain),
    settled = vi.fn();
  d.motion.subscribeSettled(settled);
  d.motion.zoomBy(2, { x: 0, y: 0 });
  const calls = constrain.mock.calls.length;
  d.motion.reframe({ x: 0, y: 100, zoom: 1 }, false);
  expect(d.motion.read()).toEqual({ x: 0, y: 100, zoom: 1 });
  expect(constrain).toHaveBeenCalledTimes(calls);
  expect(d.frames.size).toBe(0);
  expect(settled).not.toHaveBeenCalled();
  d.motion.reframe({ x: 0, y: 20, zoom: 1 });
  expect(settled).toHaveBeenCalledOnce();
  d.motion.dispose();
  d.motion.reframe({ x: 1, y: 1, zoom: 1 });
  expect(d.motion.read()).toEqual({ x: 0, y: 20, zoom: 1 });
});

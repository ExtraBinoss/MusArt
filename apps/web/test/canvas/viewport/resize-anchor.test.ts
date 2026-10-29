import { expect, test, vi } from "vitest";
import { ViewMotion } from "../../../src/canvas/viewport/motion";
import { createResizeAnchor } from "../../../src/canvas/viewport/resize-anchor";
import { constrainView } from "../../../src/canvas/viewport/view";

function fixture() {
  let rectangle = { left: 20, top: 10, width: 1000, height: 1000 },
    reduced = false;
  let scope = {};
  const rect = vi.fn(() => rectangle);
  const size = { width: 800, height: 600 };
  const frame = vi.fn(),
    settled = vi.fn(),
    stopped = vi.fn();
  let update!: (value: number) => void, finish!: () => void;
  const driver = {
    stop: stopped,
    finished: new Promise<void>((done) => {
      finish = done;
    }),
  };
  const spring = vi.fn((next: (value: number) => void) => {
    update = next;
    return driver;
  });
  const motion = new ViewMotion({
    clock: { now: () => 0, request: () => 1, cancel: vi.fn() },
    reduced: () => reduced,
    constrain: (view) => constrainView(view, size, rectangle),
  });
  motion.subscribe(frame);
  motion.subscribeSettled(settled);
  const anchor = createResizeAnchor({
    motion,
    rect,
    workspace: () => size,
    reduced: () => reduced,
    spring,
    scope: () => scope,
  });
  return {
    anchor,
    motion,
    rect,
    frame,
    settled,
    spring,
    stopped,
    rectangle: () => rectangle,
    resize: (height: number) => {
      rectangle = { ...rectangle, height };
    },
    reduce: () => {
      reduced = true;
    },
    step: (value: number) => update(value),
    finish: () => finish(),
    replace: () => {
      scope = {};
    },
  };
}

test("pin and unpin preserve exact screen coordinates and zoom without any document or layout animation", async () => {
  const d = fixture();
  const before = d.rectangle();
  const lease = d.anchor.capture()!;
  d.resize(700);
  lease.apply();
  await lease.finished;
  expect(d.motion.read()).toEqual({ x: 0, y: 150, zoom: 1 });
  expect(d.rectangle().top + d.rectangle().height / 2 + d.motion.read().y).toBe(
    before.top + before.height / 2,
  );
  expect(d.spring).not.toHaveBeenCalled();
  expect(d.rect).toHaveBeenCalledTimes(2);
  expect(d.settled).toHaveBeenCalledOnce();
  const unpin = d.anchor.capture()!;
  d.resize(1000);
  unpin.apply();
  await unpin.finished;
  expect(d.motion.read()).toEqual({ x: 0, y: 0, zoom: 1 });
  expect(d.settled).toHaveBeenCalledTimes(2);
});

test("a constrained edge starts at the old screen pose then springs only position with no React-frame commits or geometry reads", async () => {
  const d = fixture(),
    lease = d.anchor.capture()!;
  d.resize(350);
  lease.apply();
  expect(d.motion.read()).toEqual({ x: 0, y: 325, zoom: 1 });
  expect(d.spring).toHaveBeenCalledOnce();
  expect(d.anchor.resizeHandled()).toBe(true);
  const reads = d.rect.mock.calls.length;
  for (const value of [0, 0.25, 0.5, 0.75, 1]) d.step(value);
  expect(d.rect).toHaveBeenCalledTimes(reads);
  expect(d.settled).not.toHaveBeenCalled();
  expect(d.motion.read()).toEqual({ x: 0, y: 230, zoom: 1 });
  d.finish();
  await lease.finished;
  expect(d.settled).toHaveBeenCalledOnce();
  expect(d.stopped).toHaveBeenCalledOnce();
  expect(d.anchor.resizeHandled()).toBe(false);
});

test("rapid reentry, input cancellation and an unrelated resize reject stale frames", async () => {
  const d = fixture(),
    first = d.anchor.capture()!;
  d.resize(350);
  first.apply();
  d.step(0.5);
  const sampled = d.motion.read();
  const second = d.anchor.capture()!;
  await first.finished;
  d.step(1);
  expect(d.motion.read()).toBe(sampled);
  d.resize(1000);
  second.apply();
  await second.finished;
  expect(d.motion.read().y).toBe(sampled.y - 325);
  const third = d.anchor.capture()!;
  d.resize(350);
  third.apply();
  d.anchor.cancel();
  await third.finished;
  const cancelled = d.motion.read();
  d.step(1);
  expect(d.motion.read()).toBe(cancelled);
  const fourth = d.anchor.capture()!;
  d.resize(200);
  fourth.apply();
  d.resize(500);
  expect(d.anchor.resizeHandled()).toBe(false);
  await fourth.finished;
});

test("reduced motion settles immediately and retired captures cannot apply into a replacement", async () => {
  const d = fixture();
  d.reduce();
  const first = d.anchor.capture()!;
  d.resize(350);
  first.apply();
  await first.finished;
  expect(d.motion.read().y).toBe(230);
  expect(d.spring).not.toHaveBeenCalled();
  const abandoned = d.anchor.capture()!;
  d.anchor.cancel();
  const before = d.motion.read();
  d.resize(1000);
  abandoned.apply();
  await abandoned.finished;
  expect(d.motion.read()).toBe(before);
});

test("live reduced motion finishes the correction and a replaced scope rejects late samples", async () => {
  const d = fixture(),
    first = d.anchor.capture()!;
  d.resize(350);
  first.apply();
  d.step(0.25);
  d.reduce();
  d.anchor.finish();
  await first.finished;
  expect(d.motion.read().y).toBe(230);
  const next = fixture(),
    stale = next.anchor.capture()!;
  next.resize(350);
  stale.apply();
  const current = next.motion.read();
  next.replace();
  next.step(0.5);
  await stale.finished;
  expect(next.motion.read()).toBe(current);
  expect(next.stopped).toHaveBeenCalledOnce();
});

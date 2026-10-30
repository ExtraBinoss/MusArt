import { expect, it, vi } from "vitest";
import type { MotionEasing } from "@musart/core";
import { createEasingPreview } from "../../../../src/components/motion/easing/preview";

it("publishes immutable exact curves, skips equivalent hovers and restores the empty preview", () => {
  const preview = createEasingPreview(),
    changed = vi.fn(),
    stop = preview.subscribe(changed);
  expect(preview.read()).toBeNull();
  const value: MotionEasing = { type: "cubicBezier", x1: 0.2, y1: -0.5, x2: 0.8, y2: 1.5 };
  preview.set(value);
  const published = preview.read();
  expect(published).toEqual(value);
  expect(published).not.toBe(value);
  expect(Object.isFrozen(published)).toBe(true);
  preview.set({ ...value });
  expect(changed).toHaveBeenCalledTimes(1);
  expect(preview.read()).toBe(published);
  preview.set({ type: "spring", bounce: 0.5 });
  preview.set({ type: "spring", bounce: 0.5, response: 12 });
  expect(changed).toHaveBeenCalledTimes(2);
  preview.set(null);
  preview.set(null);
  expect(preview.read()).toBeNull();
  expect(changed).toHaveBeenCalledTimes(3);
  stop();
  stop();
  preview.set({ type: "hold" });
  expect(changed).toHaveBeenCalledTimes(3);
});

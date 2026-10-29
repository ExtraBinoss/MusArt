import { expect, test } from "vitest";
import {
  createMotionEasingPreset,
  evaluateEasing,
  isMotionEasing,
  MOTION_EASING_PRESETS,
  validateMotionEasing,
  type MotionEasing,
} from "../../src/motion/easing";

test("linear and incoming HOLD use exact clamped boundaries", () => {
  for (const progress of [-1, 0, 0.1, 0.5, 1 - Number.EPSILON, 1, 2]) {
    expect(evaluateEasing(progress, { type: "linear" })).toBe(Math.max(0, Math.min(1, progress)));
    expect(evaluateEasing(progress, { type: "hold" })).toBe(progress >= 1 ? 1 : 0);
  }
});

test("inverts cubic Bezier time rather than treating its parameter as progress", () => {
  const easing: MotionEasing = { type: "cubicBezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
  expect(evaluateEasing(0.5, easing)).toBeCloseTo(0.802403387584857, 12);
  expect(evaluateEasing(0.25, easing)).toBeCloseTo(0.4085105913553958, 12);
  expect(evaluateEasing(0, easing)).toBe(0);
  expect(evaluateEasing(1, easing)).toBe(1);
  expect(evaluateEasing(0.123, { type: "cubicBezier", x1: 0, y1: 0, x2: 0, y2: 0 })).toBe(0.123);
});

test("handles flat endpoints, extreme small input and valid overshooting controls", () => {
  const flatStart: MotionEasing = { type: "cubicBezier", x1: 0, y1: 1, x2: 0, y2: 1 };
  const flatEnd: MotionEasing = { type: "cubicBezier", x1: 1, y1: 0, x2: 1, y2: 0 };
  expect(evaluateEasing(1 / 8, flatStart)).toBeCloseTo(7 / 8, 14);
  expect(evaluateEasing(7 / 8, flatEnd)).toBeCloseTo(1 / 8, 14);
  const nearStart = evaluateEasing(1e-30, { ...flatStart, x2: 1 });
  expect(nearStart).toBeGreaterThan(0);
  expect(nearStart).toBeLessThan(1e-12);
  expect(evaluateEasing(0.25, createMotionEasingPreset("easeInBack"))).toBeLessThan(0);
  expect(evaluateEasing(0.75, createMotionEasingPreset("easeOutBack"))).toBeGreaterThan(1);
  const extreme: MotionEasing = {
    type: "cubicBezier",
    x1: 0,
    y1: Number.MAX_VALUE,
    x2: 1,
    y2: Number.MAX_VALUE,
  };
  expect(Number.isFinite(evaluateEasing(0.5, extreme))).toBe(true);
});

test("spring curves are analytic, endpoint-normalized and independent of seek history", () => {
  const spring: MotionEasing = { type: "spring", bounce: 0.7, response: 14 };
  const times = Array.from({ length: 101 }, (_, index) => index / 100);
  const forward = times.map((time) => evaluateEasing(time, spring));
  expect(Math.max(...forward)).toBeGreaterThan(1);
  expect(forward[0]).toBe(0);
  expect(forward.at(-1)).toBe(1);
  for (const index of [100, 0, 75, 20, 99, 1, 50, 20, 75])
    expect(evaluateEasing(times[index]!, spring)).toBe(forward[index]);
  for (const bounce of [0, 1e-10, 0.5, 1])
    for (const response of [1, 12, 40])
      for (const time of times)
        expect(Number.isFinite(evaluateEasing(time, { type: "spring", bounce, response }))).toBe(
          true,
        );
  expect(evaluateEasing(0.3, { type: "spring", bounce: 0.3 })).toBe(
    evaluateEasing(0.3, { type: "spring", bounce: 0.3, response: 12 }),
  );
  expect(evaluateEasing(0.3, createMotionEasingPreset("quick"))).toBeGreaterThan(
    evaluateEasing(0.3, createMotionEasingPreset("slow")),
  );
});

test.each(MOTION_EASING_PRESETS)("preset %s is immutable, valid and portable", (preset) => {
  const easing = createMotionEasingPreset(preset);
  expect(Object.isFrozen(easing)).toBe(true);
  expect(isMotionEasing(easing)).toBe(true);
  expect(() => validateMotionEasing(easing)).not.toThrow();
  expect(JSON.parse(JSON.stringify(easing))).toEqual(easing);
  expect(evaluateEasing(0, easing)).toBe(0);
  expect(evaluateEasing(1, easing)).toBe(1);
});

test.each([
  null,
  [],
  {},
  { type: "unknown" },
  { type: "linear", bounce: 0 },
  { type: "hold", x1: 0 },
  { type: "cubicBezier", x1: -0.1, y1: 0, x2: 1, y2: 1 },
  { type: "cubicBezier", x1: 0, y1: 0, x2: 1.1, y2: 1 },
  { type: "cubicBezier", x1: 0, y1: NaN, x2: 1, y2: 1 },
  { type: "cubicBezier", x1: 0, y1: 0, x2: 1, y2: Infinity },
  { type: "cubicBezier", x1: 0, x2: 1, y2: 1 },
  { type: "spring", bounce: -0.1 },
  { type: "spring", bounce: 1.1 },
  { type: "spring", bounce: NaN },
  { type: "spring", bounce: 0.5, response: 0 },
  { type: "spring", bounce: 0.5, response: 41 },
  { type: "spring", bounce: 0.5, response: Infinity },
  { type: "spring", bounce: 0.5, response: "12" },
  { type: "spring", bounce: 0.5, stiffness: 100 },
])("rejects malformed easing %j", (value) => {
  expect(isMotionEasing(value)).toBe(false);
  expect(() => validateMotionEasing(value)).toThrow();
  expect(() => evaluateEasing(0.5, value as never)).toThrow();
});

test.each([NaN, Infinity, -Infinity])("rejects nonfinite progress %s", (progress) => {
  expect(() => evaluateEasing(progress, { type: "linear" })).toThrow();
});

test("rejects unknown or inherited preset names", () => {
  expect(() => createMotionEasingPreset("missing" as never)).toThrow();
  expect(() => createMotionEasingPreset("constructor" as never)).toThrow();
});

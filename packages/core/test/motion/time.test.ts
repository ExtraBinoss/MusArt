import { expect, test } from "vitest";
import {
  addMotionTime,
  compareMotionTime,
  frameTime,
  isMotionFrameRate,
  isMotionTime,
  motionTimeProgress,
  motionTimeToSeconds,
  normalizeMotionFrameRate,
  normalizeMotionTime,
  subtractMotionTime,
  validateMotionFrameRate,
  validateMotionTime,
} from "../../src/motion/time";

test("normalizes signed portable times and exact fractional frame rates", () => {
  expect(normalizeMotionTime({ value: -12, rate: 18 })).toEqual({ value: -2, rate: 3 });
  expect(normalizeMotionTime({ value: -0, rate: 90000 })).toEqual({ value: 0, rate: 1 });
  expect(normalizeMotionFrameRate({ numerator: 60000, denominator: 2002 })).toEqual({
    numerator: 30000,
    denominator: 1001,
  });
  expect(frameTime(30000, { numerator: 30000, denominator: 1001 })).toEqual({
    value: 1001,
    rate: 1,
  });
  expect(frameTime(-15, { numerator: 30, denominator: 1 })).toEqual({ value: -1, rate: 2 });
  expect(motionTimeToSeconds({ value: 1001, rate: 30000 })).toBe(1001 / 30000);
  expect(JSON.parse(JSON.stringify(frameTime(1, { numerator: 30000, denominator: 1001 })))).toEqual(
    {
      value: 1001,
      rate: 30000,
    },
  );
});

test("compares exact times when floating-point seconds cannot distinguish them", () => {
  const max = Number.MAX_SAFE_INTEGER;
  const smaller = { value: max - 2, rate: max - 1 };
  const larger = { value: max - 1, rate: max };
  expect(motionTimeToSeconds(smaller)).toBe(motionTimeToSeconds(larger));
  expect(compareMotionTime(smaller, larger)).toBe(-1);
  expect(compareMotionTime(larger, smaller)).toBe(1);
  expect(motionTimeProgress(smaller, { value: 0, rate: 1 }, larger)).toBeLessThan(1);
  expect(compareMotionTime({ value: 1, rate: 2 }, { value: 2, rate: 4 })).toBe(0);
  expect(compareMotionTime({ value: -1, rate: 1 }, { value: 0, rate: 1 })).toBe(-1);
  expect(compareMotionTime({ value: 5, rate: 7 }, { value: 5, rate: 7 })).toBe(0);
  expect(compareMotionTime({ value: 6, rate: 7 }, { value: 5, rate: 7 })).toBe(1);
});

test("adds and subtracts without overflowing reducible intermediate fractions", () => {
  expect(addMotionTime({ value: 1, rate: 3 }, { value: 1, rate: 6 })).toEqual({
    value: 1,
    rate: 2,
  });
  expect(subtractMotionTime({ value: 1, rate: 6 }, { value: 1, rate: 3 })).toEqual({
    value: -1,
    rate: 6,
  });
  const max = Number.MAX_SAFE_INTEGER;
  expect(addMotionTime({ value: max, rate: max }, { value: max, rate: max })).toEqual({
    value: 2,
    rate: 1,
  });
  expect(subtractMotionTime({ value: max, rate: max }, { value: max, rate: max })).toEqual({
    value: 0,
    rate: 1,
  });
  expect(frameTime(max, { numerator: max, denominator: max })).toEqual({ value: max, rate: 1 });
  expect(() => addMotionTime({ value: max, rate: 1 }, { value: 1, rate: 1 })).toThrow(RangeError);
  expect(() => subtractMotionTime({ value: -max, rate: 1 }, { value: 1, rate: 1 })).toThrow(
    RangeError,
  );
  expect(() => addMotionTime({ value: 1, rate: max }, { value: 1, rate: max - 1 })).toThrow(
    RangeError,
  );
  expect(() => frameTime(max, { numerator: 1, denominator: 2 })).toThrow(RangeError);
});

test("locates exact interval boundaries and stable seek-order-independent progress", () => {
  const fps = { numerator: 30000, denominator: 1001 };
  const start = frameTime(100, fps);
  const end = frameTime(200, fps);
  const indices = [50, 100, 101, 125, 150, 175, 199, 200, 250];
  const expected = new Map(
    indices.map((index) => [index, Math.max(0, Math.min(1, (index - 100) / 100))]),
  );
  for (const index of [...indices, ...[...indices].reverse(), 199, 101, 175, 125])
    expect(motionTimeProgress(frameTime(index, fps), start, end)).toBe(expected.get(index));
  const max = Number.MAX_SAFE_INTEGER;
  expect(
    motionTimeProgress({ value: 0, rate: 1 }, { value: -max, rate: 1 }, { value: max, rate: 1 }),
  ).toBe(0.5);
  expect(() => motionTimeProgress(start, end, start)).toThrow();
  expect(() => motionTimeProgress(start, start, start)).toThrow();
});

test.each([
  null,
  [],
  {},
  { value: 1, rate: 0 },
  { value: 1, rate: -1 },
  { value: 1.5, rate: 1 },
  { value: NaN, rate: 1 },
  { value: Infinity, rate: 1 },
  { value: 1, rate: 1.5 },
  { value: Number.MAX_SAFE_INTEGER + 1, rate: 1 },
  { value: 1, rate: Number.MAX_SAFE_INTEGER + 1 },
  { value: "1", rate: 1 },
  { value: 1, rate: "1" },
])("rejects invalid portable time %j", (value) => {
  expect(isMotionTime(value)).toBe(false);
  expect(() => validateMotionTime(value)).toThrow();
  expect(() => normalizeMotionTime(value as never)).toThrow();
});

test.each([
  null,
  [],
  {},
  { numerator: 0, denominator: 1 },
  { numerator: -1, denominator: 1 },
  { numerator: 30, denominator: 0 },
  { numerator: 30, denominator: -1 },
  { numerator: 29.97, denominator: 1 },
  { numerator: 30, denominator: 1.5 },
  { numerator: Infinity, denominator: 1 },
  { numerator: 1, denominator: Number.MAX_SAFE_INTEGER + 1 },
])("rejects invalid frame rate %j", (value) => {
  expect(isMotionFrameRate(value)).toBe(false);
  expect(() => validateMotionFrameRate(value)).toThrow();
  expect(() => normalizeMotionFrameRate(value as never)).toThrow();
  expect(() => frameTime(0, value as never)).toThrow();
});

test.each([NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])(
  "rejects invalid frame index %s",
  (index) => {
    expect(() => frameTime(index, { numerator: 30, denominator: 1 })).toThrow();
  },
);

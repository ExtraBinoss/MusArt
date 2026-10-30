import { expect, test } from "vitest";
import { intersectMotionIntervals } from "../../src/motion/intervals";
const t = (value: number, rate = 1) => ({ value, rate });
test("intersects disjoint nested presence windows without rounding or joining gaps", () => {
  const left = [{ start: t(0), end: t(5) }];
  const right = [
    { start: t(1, 3), end: t(2) },
    { start: t(3), end: t(6) },
  ];
  expect(intersectMotionIntervals(left, right)).toEqual([
    { start: t(1, 3), end: t(2) },
    { start: t(3), end: t(5) },
  ]);
  expect(intersectMotionIntervals(right, left)).toEqual(intersectMotionIntervals(left, right));
  expect(left).toEqual([{ start: t(0), end: t(5) }]);
  expect(intersectMotionIntervals([], right)).toEqual([]);
});
test("shared endpoints are half-open and equivalent rational ends advance both pointers", () => {
  expect(
    intersectMotionIntervals(
      [
        { start: t(0), end: t(1) },
        { start: t(2), end: t(3) },
      ],
      [
        { start: t(2, 2), end: t(4, 2) },
        { start: t(5, 2), end: t(4) },
      ],
    ),
  ).toEqual([{ start: t(5, 2), end: t(3) }]);
});

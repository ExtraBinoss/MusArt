import { expect, it } from "vitest";
import {
  createTimelineIntervalIndex,
  timelineLowerBound,
} from "../../../../src/components/motion/canvas/intervals";

it("queries nested and disjoint intervals in canonical order without touching the source", () => {
  const items = [
    { id: "long", start: 1, end: 100 },
    { id: "later", start: 10, end: 12 },
    { id: "first", start: 0, end: 2 },
    { id: "inherited", start: 50, end: Infinity },
  ];
  const original = items.map((item) => ({ ...item }));
  const query = createTimelineIntervalIndex(items, (item) => item);
  for (let start = 0; start < 120; start += 3) {
    const end = start + 4;
    expect(query(start, end)).toEqual(
      items.filter((item) => item.start <= end && item.end >= start),
    );
  }
  expect(items).toEqual(original);
  expect(query(12, 10)).toEqual([]);
  expect(query(NaN, 1)).toEqual([]);
  expect(createTimelineIntervalIndex([], () => ({ start: 0, end: 1 }))(0, 1)).toEqual([]);
});
it("finds duplicate exact boundaries and empty/end insertion points", () => {
  const values = [0, 2, 2, 3];
  expect(timelineLowerBound(values, 2, (value) => value)).toBe(1);
  expect(timelineLowerBound(values, -1, (value) => value)).toBe(0);
  expect(timelineLowerBound(values, 9, (value) => value)).toBe(4);
  expect(timelineLowerBound([], 0, Number)).toBe(0);
});

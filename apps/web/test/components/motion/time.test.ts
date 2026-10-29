import { expect, it } from "vitest";
import {
  formatTimelineTime,
  parseTimelineTime,
  timelineTicks,
  timelineTime,
} from "../../../src/components/motion/time";

it("uses one explicit rational input precision and consistent s/ms fields", () => {
  expect(timelineTime(1.25)).toEqual({ value: 5, rate: 4 });
  expect(parseTimelineTime("1250", "ms")).toEqual(timelineTime(1.25));
  expect(parseTimelineTime("1.25", "s")).toEqual(timelineTime(1.25));
  expect(formatTimelineTime({ value: 1, rate: 3 }, "s")).toBe("0.333333");
  expect(formatTimelineTime({ value: 1, rate: 3 }, "ms")).toBe("333.333");
  for (const value of ["", " ", "-1", "NaN", "Infinity", "bad", "1e99"])
    expect(parseTimelineTime(value, "s")).toBeNull();
  expect(parseTimelineTime("0", "s")).toEqual({ value: 0, rate: 1 });
  expect(() => timelineTime(Infinity)).toThrow();
  expect(() => timelineTime(1e99)).toThrow();
});

it("keeps ruler marks bounded and legible at very different temporal zooms", () => {
  for (const scale of [0.01, 20, 120, 640, 10_000]) {
    const ticks = timelineTicks(250, 1000, scale);
    expect(ticks.length).toBeLessThanOrEqual(100);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((tick) => Number.isFinite(tick.time) && tick.time >= 0)).toBe(true);
    for (let index = 1; index < ticks.length; index++)
      expect(ticks[index]!.x - ticks[index - 1]!.x).toBeGreaterThanOrEqual(79.999);
  }
  for (const scale of [0, -1, Infinity, NaN]) expect(timelineTicks(0, 100, scale)).toEqual([]);
  expect(timelineTicks(0, 0, 100)).toEqual([]);
});

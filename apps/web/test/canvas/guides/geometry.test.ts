import { expect, it } from "vitest";
import { rulerTicks } from "../../../src/canvas/guides/geometry";
it("places world ticks under pan and zoom with readable major spacing", () => {
  for (const zoom of [0.05, 0.5, 1, 2, 8]) {
    const ticks = rulerTicks(700, 123, zoom);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((t) => t.position >= 0 && t.position <= 700)).toBe(true);
    for (const tick of ticks) expect(tick.position).toBeCloseTo(123 + tick.value * zoom);
    const major = ticks.filter((t) => t.major);
    expect(major.length).toBeGreaterThan(1);
    const gap = major[1]!.position - major[0]!.position;
    expect(gap).toBeGreaterThanOrEqual(60);
    expect(gap).toBeLessThanOrEqual(160);
  }
});
it("handles empty extents and caps pathological tick counts deterministically", () => {
  expect(rulerTicks(0, 0, 1)).toEqual([]);
  expect(rulerTicks(100, 0, 0)).toEqual([]);
  expect(rulerTicks(-1, 0, 1)).toEqual([]);
  expect(rulerTicks(1e7, 0, 1)).toHaveLength(2000);
  expect(rulerTicks(100, 0, 1).find((t) => t.value === 0)).toMatchObject({
    position: 0,
    major: true,
  });
  expect(rulerTicks(400, -200, 2)).toEqual(rulerTicks(400, -200, 2));
});

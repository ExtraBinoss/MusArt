import { expect, it } from "vitest";
import { quadraticCurves } from "../../../src/surface/text/curves";
it("closes contours and retains quadratic segments, including holes", () => {
  const curves = quadraticCurves([
    { type: "M", x: 0, y: 0 },
    { type: "L", x: 4, y: 0 },
    { type: "Q", x1: 6, y1: 2, x: 4, y: 4 },
    { type: "Z" },
    { type: "M", x: 1, y: 1 },
    { type: "L", x: 1, y: 2 },
  ]);
  expect(curves).toHaveLength(5);
  expect(curves[1]).toEqual({ p0: [4, 0], p1: [6, 2], p2: [4, 4] });
  expect(curves.at(-1)!.p2).toEqual([1, 1]);
  expect(
    quadraticCurves([{ type: "M", x: 0, y: 0 }, { type: "L", x: 0, y: 0 }, { type: "Z" }]),
  ).toEqual([]);
});
it("approximates cubic outlines with bounded-error quadratics instead of dropping CFF glyphs", () => {
  const curves = quadraticCurves([
    { type: "M", x: 0, y: 0 },
    { type: "C", x1: 0, y1: 100, x2: 100, y2: 100, x: 100, y: 0 },
  ]);
  expect(curves.length).toBeGreaterThan(2);
  expect(curves[0]!.p0).toEqual([0, 0]);
  expect(curves.at(-2)!.p2).toEqual([100, 0]);
  for (let index = 1; index < curves.length; index++)
    expect(curves[index]!.p0).toEqual(curves[index - 1]!.p2);
  for (const curve of curves)
    expect([...curve.p0, ...curve.p1, ...curve.p2].every(Number.isFinite)).toBe(true);
});

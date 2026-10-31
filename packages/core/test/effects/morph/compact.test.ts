import { expect, test } from "vitest";
import { compactShapeMorph } from "../../../src/effects/morph/compact";
import type { MorphPoint, ShapeMorph } from "../../../src/effects/morph/model";
const square = (low: number, high: number): MorphPoint[] =>
  Array.from({ length: 80 }, (_, i) => {
    const k = (i % 20) / 20;
    if (i < 20) return [low + (high - low) * k, low];
    if (i < 40) return [high, low + (high - low) * k];
    if (i < 60) return [high - (high - low) * k, high];
    return [low, high - (high - low) * k];
  });
const fixture = (): ShapeMorph => ({
  version: 1,
  sourceText: "O",
  shapes: [
    {
      frames: [0, 1].map((at) => ({
        at,
        box: [0, 0, 1, 1],
        contours: [
          { hole: false, points: square(0, 1) },
          { hole: true, points: square(0.25, 0.75).reverse() },
        ],
      })),
    },
  ],
});
test("compacts redundant closed paths while retaining timing, placements, counters and source ownership", () => {
  const source = fixture(),
    before = structuredClone(source);
  const compact = compactShapeMorph(source, { width: 1920, height: 1080, maxErrorPx: 0.5 });
  expect(source).toEqual(before);
  expect(compact.sourceText).toBe("O");
  for (let i = 0; i < 2; i++) {
    expect(compact.shapes[0]!.frames[i]!.at).toBe(i);
    expect(compact.shapes[0]!.frames[i]!.box).toEqual([0, 0, 1, 1]);
    const contours = compact.shapes[0]!.frames[i]!.contours;
    expect(contours.map((c) => c.hole)).toEqual([false, true]);
    expect(contours.map((c) => c.points.length)).toEqual([4, 4]);
  }
  expect(compactShapeMorph(source, { width: 1920, height: 1080, maxErrorPx: 0 })).toBe(source);
});
test("does not collapse tiny contours or accept invalid dimensions, tolerances or source data", () => {
  const source = fixture();
  source.shapes[0]!.frames.forEach((frame) => {
    frame.contours[1]!.points = [
      [0.5, 0.5],
      [0.500001, 0.5],
      [0.5, 0.500001],
    ];
  });
  const compact = compactShapeMorph(source, { width: 1080, height: 1080, maxErrorPx: 1.5 });
  expect(compact.shapes[0]!.frames[0]!.contours[1]!.points.length).toBeGreaterThanOrEqual(3);
  for (const width of [0, -1, NaN, Infinity])
    expect(() => compactShapeMorph(source, { width, height: 1080, maxErrorPx: 1 })).toThrow();
  expect(() => compactShapeMorph(source, { width: 1080, height: 1080, maxErrorPx: 5 })).toThrow();
  expect(() =>
    compactShapeMorph({ ...source, shapes: [] }, { width: 1080, height: 1080, maxErrorPx: 1 }),
  ).toThrow();
});

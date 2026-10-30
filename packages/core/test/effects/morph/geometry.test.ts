import { expect, test } from "vitest";
import { prepareMorphShape } from "../../../src/effects/morph/geometry";
import type { MorphShapeFrame } from "../../../src/effects/morph/model";
test("aligns winding and cyclic origins without moving identical outlines", () => {
  const frames: MorphShapeFrame[] = [
    {
      at: 0,
      box: [0, 0, 1, 1],
      contours: [
        {
          hole: false,
          points: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        },
      ],
    },
    {
      at: 1,
      box: [0, 0, 1, 1],
      contours: [
        {
          hole: false,
          points: [
            [1, 1],
            [1, 0],
            [0, 0],
            [0, 1],
          ],
        },
      ],
    },
  ];
  const before = structuredClone(frames),
    result = prepareMorphShape(frames);
  expect(result[0]!.contours[0]!.points).toEqual(result[1]!.contours[0]!.points);
  expect(frames).toEqual(before);
});

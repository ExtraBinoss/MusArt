import { expect, test } from "vitest";
import { validateShapeMorph } from "../../../src/effects/morph/validation";
const contour = {
  hole: false,
  points: [
    [0, 0],
    [1, 0],
    [1, 1],
  ],
};
const shape = { frames: [0, 1].map((at) => ({ at, box: [0, 0, 1, 1], contours: [contour] })) };
test("rejects oversized data, missing outer contours, invalid timing and zero-size placement", () => {
  validateShapeMorph({ version: 1, shapes: [shape] });
  for (const bad of [
    { version: 1, shapes: Array(257).fill(shape) },
    { version: 1, shapes: [{ frames: [...shape.frames, shape.frames[1]] }] },
    {
      version: 1,
      shapes: [{ frames: shape.frames.map((frame) => ({ ...frame, box: [0, 0, 0, 1] })) }],
    },
    {
      version: 1,
      shapes: [
        {
          frames: shape.frames.map((frame) => ({
            ...frame,
            contours: [{ ...contour, hole: true }],
          })),
        },
      ],
    },
  ])
    expect(() => validateShapeMorph(bad)).toThrow();
});

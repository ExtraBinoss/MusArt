import type { ShapeMorph } from "@musart/core";
export function morphFixture(): ShapeMorph {
  return {
    version: 1,
    shapes: [
      {
        frames: [0, 1].map((at) => ({
          at,
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
        })),
      },
    ],
  };
}

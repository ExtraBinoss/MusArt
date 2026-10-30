import { expect, test } from "vitest";
import { buildMorphAtlas } from "../../../src/surface/morph/atlas";
import { morphResourceKey } from "../../../src/surface/morph/resource";
import { createEffect, createLayer, type ShapeMorph } from "@musart/core";
const shape: ShapeMorph = {
  version: 1,
  shapes: [
    {
      frames: [
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
          box: [0.2, 0.2, 0.6, 0.6],
          contours: [
            {
              hole: false,
              points: [
                [0.5, 0],
                [1, 0.5],
                [0.5, 1],
                [0, 0.5],
              ],
            },
          ],
        },
      ],
    },
  ],
};
test("morph atlases retain union bands and independent state planes within the byte budget", () => {
  const atlas = buildMorphAtlas(shape);
  expect(atlas.states).toBe(2);
  expect(atlas.shapes[0]!.frames[0]!.contours[0]!.points).toHaveLength(256);
  expect(atlas.bytes).toBe(atlas.texture.image.data!.byteLength);
  expect(atlas.bytes).toBeLessThan(64 * 1024 * 1024);
  const pixels = atlas.texture.image.data as Float32Array,
    header = atlas.shapes[0]!.header * 4;
  expect(pixels[header + 1]).toBeGreaterThan(0);
  expect(Array.from(pixels.slice(header, header + 4))).toEqual(
    Array.from(pixels.slice(atlas.stride * 4 + header, atlas.stride * 4 + header + 4)),
  );
  atlas.texture.dispose();
});
test("progress, strength and glyph order preserve geometry resource identities", () => {
  const layer = createLayer("text", { text: "Type" }),
    effect = createEffect("morph", { shapeMorph: shape });
  expect(morphResourceKey(layer, effect)).toBe(
    morphResourceKey(layer, {
      ...effect,
      amount: 0.3,
      settings: { ...effect.settings, progress: 0.5, stagger: 0.6, order: "reverse" },
    }),
  );
  expect(morphResourceKey(layer, effect)).not.toBe(
    morphResourceKey({ ...layer, text: "Other" }, effect),
  );
});

import { expect, it } from "vitest";
import { createEffect, createLayer, createPage } from "@musart/core";
import { previewScale } from "../../../src/canvas/render/preview-quality";
it("quantizes zoom and device density within image, pixel and retained-memory limits", () => {
  const page = createPage({
    width: 192,
    height: 140,
    layers: [createLayer("text", { width: 180, height: 100 })],
  });
  expect(previewScale(page, 0.4)).toBe(1);
  expect(previewScale(page, 1.8)).toBe(2);
  expect(previewScale(page, 4)).toBe(4);
  expect(previewScale(page, 4.000000000000001)).toBe(4);
  expect(previewScale(page, 4.000000167825129)).toBe(4);
  expect(previewScale(page, 4.001)).toBe(8);
  expect(previewScale(page, 100)).toBe(8);
  expect(previewScale(page, NaN)).toBe(1);
  expect(previewScale(page, -2)).toBe(1);
  const layers = Array.from({ length: 50 }, () =>
    createLayer("image", {
      width: 360,
      height: 240,
      effects: [createEffect("dither"), createEffect("brightness")],
      mask: { assetId: "mask", enabled: true, inverted: false },
    }),
  );
  expect(previewScale(createPage({ width: 2400, height: 1500, layers }), 2)).toBe(1);
  expect(previewScale(createPage({ width: 16000, height: 100 }), 8)).toBe(1);
  expect(previewScale(createPage({ width: 9000, height: 6000 }), 8)).toBe(1);
  expect(
    previewScale({ ...page, layers: layers.map((layer) => ({ ...layer, visible: false })) }, 4),
  ).toBe(4);
  expect(
    previewScale({ ...page, layers: layers.map((layer) => ({ ...layer, opacity: 0 })) }, 4),
  ).toBe(4);
});

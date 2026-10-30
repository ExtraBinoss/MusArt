import { expect, it } from "vitest";
import { createEffect, createLayer, createPage } from "@musart/core";
import { estimatePreviewCost } from "@musart/render";
import { previewScale, PREVIEW_MEMORY_BYTES } from "../../../src/canvas/render/preview-quality";
import { createTechnoArtboard } from "../../../src/services/projects/templates/techno";
it("uses stable quarters above1x without promoting floating noise into a new allocation tier", () => {
  const page = createPage({
    width: 192,
    height: 140,
    layers: [createLayer("text", { width: 180, height: 100 })],
  });
  for (const value of [0.05, 0.4, 0.49, 0.5, 0.51]) expect(previewScale(page, value)).toBe(value);
  expect(previewScale(page, 0.500000003)).toBe(0.5);
  expect(previewScale(createPage({ width: 16, height: 16 }), 0.05)).toBe(1 / 16);
  expect(previewScale(createPage({ width: 1, height: 16 }), 0.05)).toBe(1 / 16);
  expect(previewScale(page, 1.8)).toBe(2);
  for (const value of [4, 4.000000000000001, 4.000000167825129])
    expect(previewScale(page, value)).toBe(4);
  expect(previewScale(page, 4.001)).toBe(4.25);
  expect(previewScale(page, 100)).toBe(8);
  expect(previewScale(page, NaN)).toBe(1);
  expect(previewScale(page, -2)).toBe(1);
});
it("admits a sharper fractional AFTERHOURS preview within the unchanged estimated-memory target", () => {
  const page = createTechnoArtboard(),
    scale = previewScale(page, 2, 8192);
  expect(scale).toBeGreaterThan(1);
  expect(scale).toBeLessThanOrEqual(2);
  expect(estimatePreviewCost(page, scale).bytes + 16 * 1024 * 1024).toBeLessThanOrEqual(
    PREVIEW_MEMORY_BYTES,
  );
  expect(previewScale(page, 4, 8192)).toBe(scale);
});
it("applies memory, pixel and real device bounds below1x as well as above1x", () => {
  const giant = createPage({ width: 9000, height: 6000 }),
    scale = previewScale(giant, 8, 8192);
  expect(scale).toBeLessThan(1);
  expect(9000 * scale).toBeLessThanOrEqual(8192);
  expect(estimatePreviewCost(giant, scale).bytes + 16 * 1024 * 1024).toBeLessThanOrEqual(
    PREVIEW_MEMORY_BYTES,
  );
  const thin = createPage({ width: 32768, height: 1 });
  expect(previewScale(thin, 1, 8192)).toBe(0.25);
  expect(Math.ceil(thin.height * previewScale(thin, 1, 8192))).toBe(1);
  const low = previewScale(giant, 0.8, 8192);
  expect(low).toBeLessThan(0.8);
});
it("keeps fixed references and required mask sources outside the main paint list", () => {
  const masks = Array.from({ length: 10 }, (_, i) =>
    createLayer("text", { id: `m${i}`, maskSource: true, visible: true, width: 512, height: 512 }),
  );
  const owners = masks.map((m, i) =>
    createLayer("rectangle", {
      id: `o${i}`,
      width: 128,
      height: 128,
      mask: { enabled: true, layerId: m.id, inverted: false },
    }),
  );
  const page = createPage({ width: 512, height: 512, layers: [...masks, ...owners] });
  expect(estimatePreviewCost(page, 1).fixedBytes).toBeGreaterThan(10 * 512 * 512 * 4);
  const heavy = createPage({
    width: 2400,
    height: 1500,
    layers: Array.from({ length: 50 }, () =>
      createLayer("image", {
        width: 360,
        height: 240,
        effects: [createEffect("dither"), createEffect("brightness")],
        mask: { assetId: "mask", enabled: true, inverted: false },
      }),
    ),
  });
  const scale = previewScale(heavy, 2);
  expect(scale).toBe(2);
  expect(estimatePreviewCost(heavy, scale).bytes + 16 * 1024 * 1024).toBeLessThanOrEqual(
    PREVIEW_MEMORY_BYTES,
  );
  expect(previewScale(heavy, 4)).toBeLessThan(4);
});

it("keeps fifty original photos outside the target soft budget and does not shrink impossible originals to one pixel", () => {
  const layers = Array.from({ length: 50 }, (_, i) =>
    createLayer("image", { assetId: `photo-${i}`, width: 1280, height: 960 }),
  );
  const assets = Object.fromEntries(
    layers.map((l) => [
      l.assetId,
      {
        id: l.assetId,
        width: 1280,
        height: 960,
        mime: "image/png",
        dataUrl: "data:image/png;base64,",
        name: l.assetId,
      },
    ]),
  );
  const page = createPage({ width: 2400, height: 1500, layers });
  const scale = previewScale(page, 1, 8192, assets);
  expect(scale).toBe(1);
  expect(estimatePreviewCost(page, scale, assets).originalBytes).toBeGreaterThan(
    PREVIEW_MEMORY_BYTES,
  );
  expect(estimatePreviewCost(page, scale, assets).bytes + 16 * 1024 * 1024).toBeLessThan(
    384 * 1024 * 1024,
  );
  const impossible = Object.fromEntries(
    layers.map((l) => [l.assetId, { ...assets[l.assetId!]!, width: 2048, height: 2048 }]),
  );
  expect(previewScale(page, 1, 8192, impossible)).toBe(1);
  expect(previewScale(page, 0.5, 8192, impossible)).toBe(0.5);
});

import { expect, it } from "vitest";
import { createEffect, createLayer, createPage } from "@musart/core";
import { estimatePreviewCost } from "../../src/compositing/preview-cost";
it("counts real primitive batches instead of allocating each shape rectangle", () => {
  const page = createPage({
    width: 64,
    height: 64,
    layers: [createLayer("rectangle", { width: 32768, height: 1 })],
  });
  const result = estimatePreviewCost(page, 1);
  expect(result.maxDimension).toBe(64);
  expect(result.scaledBytes).toBe(64 * 64 * 4 * 2);
  expect(result.fixedBytes).toBeLessThan(1024);
});
it("clips transport groups using the same indexed viewport while preserving reference effects at1x", () => {
  const group = createLayer("group", { id: "group", x: 0, y: 0, width: 32768, height: 100 }),
    text = createLayer("text", { parentId: group.id, x: 0, y: 0, width: 32, height: 32 }),
    page = createPage({ width: 64, height: 64, layers: [group, text] });
  expect(estimatePreviewCost(page, 2).maxDimension).toBe(129);
  const fixed = createLayer("text", {
      id: "fx",
      width: 100,
      height: 60,
      effects: [createEffect("blur")],
    }),
    reference = createPage({ width: 200, height: 100, layers: [fixed] });
  const a = estimatePreviewCost(reference, 1),
    b = estimatePreviewCost(reference, 2);
  expect(a.fixedBytes).toBeGreaterThan(100 * 60 * 4 * 3);
  expect(a.fixedBytes).toBe(b.fixedBytes);
  expect(b.scaledBytes).toBe(a.scaledBytes * 4);
});
it("includes required mask sources and shares effect scratch instead of charging it per stack", () => {
  const mask = createLayer("text", {
      id: "mask",
      visible: true,
      maskSource: true,
      width: 256,
      height: 64,
    }),
    target = createLayer("rectangle", {
      id: "owner",
      width: 64,
      height: 64,
      mask: { enabled: true, layerId: mask.id, inverted: false },
    }),
    page = createPage({ width: 64, height: 64, layers: [mask, target] });
  expect(estimatePreviewCost(page, 1).fixedBytes).toBeGreaterThanOrEqual(256 * 64 * 4);
  const hidden = createPage({
    ...page,
    layers: [{ ...mask, visible: false, width: 8192, height: 8192 }, target],
  });
  expect(estimatePreviewCost(hidden, 1).maxDimension).toBe(64);
  const transparent = createPage({
    ...page,
    layers: [{ ...mask, opacity: 0, width: 8192, height: 8192 }, target],
  });
  expect(estimatePreviewCost(transparent, 1).maxDimension).toBe(64);
  const a = createLayer("text", {
      id: "a",
      width: 64,
      height: 64,
      effects: [createEffect("blur"), createEffect("invert")],
    }),
    b = { ...a, id: "b" },
    one = estimatePreviewCost(createPage({ width: 128, height: 128, layers: [a] }), 1),
    two = estimatePreviewCost(createPage({ width: 128, height: 128, layers: [a, b] }), 1);
  expect(two.fixedBytes - one.fixedBytes).toBe(one.fixedBytes - 64 * 64 * 4);
});
it("rejects invalid scales and counts original metadata dimensions without rasterizing them", () => {
  const image = createLayer("image", { assetId: "image", width: 10, height: 10 });
  const asset = {
    id: "image",
    width: 4096,
    height: 2048,
    mime: "image/png",
    dataUrl: "data:image/png;base64,",
    name: "image",
  } as const;
  const cost = estimatePreviewCost(createPage({ width: 20, height: 20, layers: [image] }), 1, {
    image: asset,
  });
  expect(cost.maxDimension).toBe(4096);
  expect(cost.originalBytes).toBe(4096 * 2048 * 4);
  expect(cost.fixedBytes).toBe(0);
  for (const invalid of [0, -1, NaN, Infinity])
    expect(() => estimatePreviewCost(createPage(), invalid)).toThrow("density");
});

it("counts independently timed video layers as separate source targets and three-slot upload rings", () => {
  const a = createLayer("video", { id: "clip-a", assetId: "shared", width: 128, height: 96 }),
    b = { ...a, id: "clip-b" };
  const asset = {
    id: "shared",
    kind: "video" as const,
    width: 128,
    height: 96,
    name: "Shared video",
    mime: "video/webm",
    originalId: "original",
    contentRevision: "1",
    byteLength: 1,
    duration: { value: 1, rate: 1 },
    firstTimestamp: { value: 0, rate: 1 },
    timeResolution: 1000,
    orientation: {
      rotation: 0 as const,
      flip: false,
      pixelAspectRatio: { numerator: 1, denominator: 1 },
    },
  };
  const one = estimatePreviewCost(createPage({ width: 128, height: 96, layers: [a] }), 1, {
    shared: asset,
  });
  const two = estimatePreviewCost(createPage({ width: 128, height: 96, layers: [a, b] }), 1, {
    shared: asset,
  });
  expect(one.originalBytes).toBe(128 * 96 * 4 * 4);
  expect(two.originalBytes).toBe(one.originalBytes * 2);
});

it("shares the same layer target when a painted layer also supplies a mask at the same density", () => {
  const source = createLayer("text", { id: "shared-mask", x: 0, y: 0, width: 128, height: 128 });
  const owner = createLayer("rectangle", {
    id: "masked",
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    mask: { enabled: true, inverted: false, layerId: source.id },
  });
  const page = createPage({ width: 192, height: 192, layers: [source, owner] });
  const shared = estimatePreviewCost(page, 1);
  const maskOnly = estimatePreviewCost(
    { ...page, layers: [{ ...source, maskSource: true }, owner] },
    1,
  );
  expect(shared.bytes).toBe(maskOnly.bytes);
  expect(estimatePreviewCost(page, 2).bytes).toBeGreaterThan(
    estimatePreviewCost({ ...page, layers: [{ ...source, maskSource: true }, owner] }, 2).bytes,
  );
});

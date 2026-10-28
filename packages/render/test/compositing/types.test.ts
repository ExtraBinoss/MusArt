import { expect, it } from "vitest";
import { createPage } from "@musart/core";
import { assertRenderSize, rasterExtent } from "../../src/compositing/types";
it("validates finite scale and allocation bounds before requesting GPU resources", () => {
  const page = createPage();
  expect(() => assertRenderSize(page, 2)).not.toThrow();
  for (const scale of [0, -1, NaN, 9])
    expect(() => assertRenderSize(page, scale)).toThrow("Échelle");
  expect(() => assertRenderSize({ ...page, width: 20000 }, 1)).toThrow("trop grand");
  expect(() => assertRenderSize({ ...page, width: 10000, height: 10000 }, 1)).toThrow("trop grand");
});
it("preserves fractional coverage but does not add pixels for ratio multiplication roundoff", () => {
  for (let edge = 16; edge <= 768; edge++) expect(rasterExtent(778, edge / 778)).toBe(edge);
  expect(rasterExtent(95.5, 1)).toBe(96);
  expect(rasterExtent(95.5, 0.25)).toBe(24);
  expect(rasterExtent(1, 0.001)).toBe(1);
  for (const [extent, scale] of [
    [Infinity, 1],
    [0, 1],
    [-1, 1],
    [1, 0],
    [1, -1],
  ])
    expect(() => rasterExtent(extent!, scale!)).toThrow("raster extent");
});

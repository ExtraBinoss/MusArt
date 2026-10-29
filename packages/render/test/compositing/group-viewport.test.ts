import { expect, it } from "vitest";
import { createLayer, layerTransform, transformPoint } from "@musart/core";
import { groupViewport, sourcePlacement } from "../../src/compositing/group-viewport";
import { rasterExtent } from "../../src/compositing/types";

it("windows a tiny target inside a giant transparent container at the original eightfold density", () => {
  const group = createLayer("group", { x: 0, y: 0, width: 1080, height: 1920 });
  const before = structuredClone(group);
  const view = groupViewport(group, 8, { x: 60, y: 1403, width: 1, height: 11 })!;
  expect(view).toMatchObject({
    pixelWidth: 10,
    pixelHeight: 90,
    empty: false,
    bounds: { x: 59.875, y: 1402.875, width: 1.25, height: 11.25 },
  });
  expect(view.key).toBe("479,11223,489,11313,0");
  expect(group).toEqual(before);
});
it("keeps full domains, clips original edges and explicitly represents invisible windows", () => {
  const group = createLayer("group", { x: 0, y: 0, width: 10, height: 10 });
  expect(groupViewport(group, 1)).toBeNull();
  expect(groupViewport(group, 1, { x: -5, y: -5, width: 20, height: 20 })).toBeNull();
  expect(groupViewport(group, 1, { x: -5, y: 4, width: 10, height: 3 })?.bounds).toEqual({
    x: 0,
    y: 3,
    width: 6,
    height: 5,
  });
  expect(groupViewport(group, 8, { x: 20, y: 20, width: 1, height: 1 })).toMatchObject({
    pixelWidth: 1,
    pixelHeight: 1,
    empty: true,
    bounds: { x: 0, y: 0, width: 0.125, height: 0.125 },
  });
  expect(() => groupViewport(group, NaN, { x: 1, y: 1, width: 1, height: 1 })).toThrow("raster");
});
it("preserves the full container's fractional texel grid rather than changing sample phase", () => {
  const group = createLayer("group", { x: 0, y: 0, width: 95.5, height: 63.25 });
  const view = groupViewport(group, 0.49, { x: 10, y: 15, width: 12, height: 8 })!;
  expect((view.bounds.x / group.width) * rasterExtent(group.width, 0.49)).toBeCloseTo(3);
  expect(rasterExtent(view.bounds.width, 0.49)).toBe(view.pixelWidth);
  expect(rasterExtent(view.bounds.height, 0.49)).toBe(view.pixelHeight);
  const integer = createLayer("group", { ...group, width: 1080, height: 1920 });
  expect(groupViewport(integer, 8, { x: 60 + 1e-13, y: 1403, width: 1, height: 11 })?.key).toBe(
    "479,11223,489,11313,0",
  );
});
it("maps rotated parent targets and cropped source quads without mutating authored geometry", () => {
  const group = createLayer("group", {
    x: 100,
    y: 80,
    width: 300,
    height: 200,
    rotation: 90,
    opacity: 0.5,
  });
  const matrix = layerTransform(group),
    a = transformPoint(matrix, { x: 20, y: 30 }),
    b = transformPoint(matrix, { x: 24, y: 40 });
  const view = groupViewport(group, 1, {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  })!;
  expect(view.bounds).toMatchObject({ x: 19, y: 29, width: 6, height: 12 });
  expect(sourcePlacement(group)).toBe(group);
  expect(sourcePlacement(group, undefined, { x: 2, y: 3 })).toMatchObject({
    x: 98,
    y: 77,
    width: 300,
    height: 200,
  });
  const placed = sourcePlacement(group, view.bounds, { x: 5, y: 7 });
  expect(placed.opacity).toBe(0.5);
  for (const p of [
    { x: 0, y: 0 },
    { x: 6, y: 12 },
  ]) {
    const expected = transformPoint(matrix, { x: p.x + view.bounds.x, y: p.y + view.bounds.y });
    const actual = transformPoint(layerTransform(placed), p);
    expect(actual.x).toBeCloseTo(expected.x - 5, 10);
    expect(actual.y).toBeCloseTo(expected.y - 7, 10);
  }
});

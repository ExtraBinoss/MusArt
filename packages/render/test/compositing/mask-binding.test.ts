import { expect, it } from "vitest";
import { createLayer, createPage, transformPoint } from "@musart/core";
import { maskLayerMapping } from "../../src/compositing/mask-binding";
it("maps target pixels into a rotated mask's local coordinates across groups", () => {
  const group = createLayer("group", {
    id: "g",
    x: 10,
    y: 20,
    width: 40,
    height: 40,
    opacity: 0.5,
  });
  const source = createLayer("rectangle", {
    id: "s",
    parentId: "g",
    x: 2,
    y: 3,
    width: 10,
    height: 20,
    rotation: 90,
    opacity: 0.4,
  });
  const target = createLayer("rectangle", {
    id: "t",
    x: 12,
    y: 23,
    width: 10,
    height: 20,
    mask: { layerId: "s", mode: "luminance", enabled: true, inverted: false },
  });
  const page = createPage({ layers: [group, source, target] });
  const map = maskLayerMapping(page, target, source, true);
  const center = transformPoint(map.matrix, { x: 5, y: 10 });
  expect(center.x).toBeCloseTo(5);
  expect(center.y).toBeCloseTo(10);
  expect(map).toMatchObject({
    sourceWidth: 10,
    sourceHeight: 20,
    targetWidth: 10,
    targetHeight: 20,
    opacity: 0.2,
    premultiplied: true,
    luminance: true,
    transformed: true,
  });
  expect(
    maskLayerMapping(
      { ...page, layers: [{ ...group, visible: false }, source, target] },
      target,
      source,
      false,
    ).opacity,
  ).toBe(0);
});

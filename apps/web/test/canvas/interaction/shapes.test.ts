import { expect, it } from "vitest";
import { SHAPE_CATALOG, type CatalogAsset } from "@musart/assets";
import { createArtworkLayer } from "../../../src/canvas/interaction/shapes";
it("creates native rectangle and ellipse drafts at the pointer with a minimum size", () => {
  for (const [id, kind, radius] of [
    ["rectangle", "rectangle", 12],
    ["circle", "ellipse", 0],
  ] as const) {
    const artwork = SHAPE_CATALOG.find((item) => item.id === id)!;
    const layer = createArtworkLayer(artwork, { x: 12, y: 34 });
    expect(layer).toMatchObject({
      name: artwork.name,
      kind,
      x: 12,
      y: 34,
      width: 1,
      height: 1,
      radius,
      fill: "#2563eb",
    });
    expect(layer.vector).toBeUndefined();
  }
});
it("keeps vector geometry, attribution and stroke-only artwork portable", () => {
  const artwork: CatalogAsset = {
    id: "lucide:star",
    name: "Star",
    viewBox: "10 20 24 24",
    path: "M10 20L20 30",
    strokeOnly: true,
    attribution: "MIT fixture",
  };
  const layer = createArtworkLayer(artwork, { x: 0, y: 0 });
  expect(layer.kind).toBe("vector");
  expect(layer.vector).toEqual({
    viewBox: artwork.viewBox,
    path: artwork.path,
    parts: undefined,
    strokeOnly: true,
    preserveColors: false,
    attribution: "MIT fixture",
  });
  expect(layer.strokeWidth).toBe(2);
  expect(layer.stroke).toBe("#2563eb");
  expect(layer.radius).toBe(0);
});

it("preserves multi-part brand paints when inserting portable artwork", () => {
  const parts = [
    { path: "M0 0h1v1H0z", fill: "#ff0000" },
    { path: "M1 0h1v1H1z", fill: "#0000ff" },
  ];
  const layer = createArtworkLayer(
    { id: "brand-fixture", name: "Brand", viewBox: "0 0 2 1", parts },
    { x: 2, y: 3 },
  );
  expect(layer.vector).toMatchObject({ parts, preserveColors: true });
});

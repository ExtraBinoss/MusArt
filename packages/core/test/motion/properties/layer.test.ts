import { expect, it } from "vitest";
import { createLayer } from "../../../src/document/factories";
import {
  LAYER_MOTION_PROPERTIES,
  layerMotionSchema,
  readLayerMotionValue,
} from "../../../src/motion/properties/layer";

it("inventories scalar transforms, paints and text through explicit whitelists", () => {
  const layer = createLayer("text", {
    fillGradient: {
      kind: "linear",
      angle: 35,
      stops: [
        { offset: 0, color: "#000" },
        { offset: 1, color: "#fff" },
      ],
    },
  });
  for (const property of LAYER_MOTION_PROPERTIES) {
    if (property === "radius") continue;
    expect(layerMotionSchema(layer, property), property).not.toBeNull();
    expect(readLayerMotionValue(layer, property), property).not.toBeUndefined();
  }
  expect(readLayerMotionValue(layer, "fillGradient.angle")).toBe(35);
  expect(readLayerMotionValue(layer, "fillGradient.kind")).toBe("linear");
  expect(layerMotionSchema(layer, "text")).toMatchObject({ interpolation: "hold", minLength: 0 });
  expect(layerMotionSchema(layer, "fill")).toMatchObject({ kind: "color", format: "rgba" });
});

it("limits type-specific fields and does not accept structural/arbitrary paths", () => {
  const rectangle = createLayer("rectangle");
  expect(layerMotionSchema(rectangle, "radius")).toMatchObject({ kind: "number", min: 0 });
  for (const property of [
    "text",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "textAlign",
  ] as const) {
    expect(layerMotionSchema(rectangle, property)).toBeNull();
  }
  expect(layerMotionSchema(createLayer("ellipse"), "radius")).toBeNull();
  for (const property of ["fillGradient.angle", "fillGradient.kind"] as const) {
    expect(layerMotionSchema(rectangle, property)).toBeNull();
    expect(readLayerMotionValue(rectangle, property)).toBeUndefined();
  }
  for (const property of [
    "__proto__",
    "constructor",
    "id",
    "parentId",
    "assetId",
    "effects.0.amount",
    "fillGradient.stops.0.color",
  ]) {
    expect(layerMotionSchema(rectangle, property as never)).toBeNull();
    expect(readLayerMotionValue(rectangle, property as never)).toBeUndefined();
  }
});

import { expect, it } from "vitest";
import { createEffect, createLayer, createPage } from "../../../src/document/factories";
import type { MotionPropertyDescriptor } from "../../../src/motion/properties/model";
import { resolveMotionProperty } from "../../../src/motion/properties/registry";
import { isValidMotionValue, validateMotionValue } from "../../../src/motion/properties/validation";

const effect = createEffect("gradient"),
  layer = createLayer("text", { effects: [effect] });
const page = createPage({ layers: [layer] });
function descriptor(
  kind: "layer" | "effect" | "effectSetting",
  property: string,
): MotionPropertyDescriptor {
  return resolveMotionProperty(page, {
    kind,
    layerId: layer.id,
    effectId: effect.id,
    property,
  } as never)!;
}

it("validates finite inclusive bounds without coercion or clamping", () => {
  const value = descriptor("layer", "opacity");
  expect(isValidMotionValue(value, 0)).toBe(true);
  expect(isValidMotionValue(value, 1)).toBe(true);
  expect(() => validateMotionValue(value, 0.5)).not.toThrow();
  for (const invalid of [
    -0.01,
    1.01,
    Infinity,
    -Infinity,
    NaN,
    "0.5",
    false,
    undefined,
    null,
    {},
    [],
    1n,
  ]) {
    expect(isValidMotionValue(value, invalid)).toBe(false);
    expect(() => validateMotionValue(value, invalid)).toThrow(
      expect.objectContaining({ code: "INVALID_COMMAND" }),
    );
  }
  const seed = descriptor("effect", "seed");
  expect(isValidMotionValue(seed, 42)).toBe(true);
  expect(isValidMotionValue(seed, 42.5)).toBe(false);
  expect(seed.interpolation).toBe("hold");
});

it("keeps booleans and choices discrete and rejects out-of-domain values", () => {
  const visible = descriptor("layer", "visible");
  expect(isValidMotionValue(visible, true)).toBe(true);
  expect(isValidMotionValue(visible, false)).toBe(true);
  expect(isValidMotionValue(visible, 1)).toBe(false);
  const blend = descriptor("layer", "blendMode");
  expect(isValidMotionValue(blend, "multiply")).toBe(true);
  expect(isValidMotionValue(blend, "__proto__")).toBe(false);
  const style = descriptor("effectSetting", "style");
  expect(isValidMotionValue(style, "silk")).toBe(true);
  expect(isValidMotionValue(style, "unknown")).toBe(false);
  expect(style.interpolation).toBe("hold");
});

it("retains the actual layer RGBA versus effect RGB6 color contracts", () => {
  const paint = descriptor("layer", "fill"),
    rgb = descriptor("effectSetting", "color0");
  for (const valid of ["#abc", "#ABCD", "#aabbcc", "#aabbccdd", "transparent"])
    expect(isValidMotionValue(paint, valid)).toBe(true);
  for (const invalid of ["red", "rgb(1,2,3)", "#12", "#12345", "#gggggg", 0])
    expect(isValidMotionValue(paint, invalid)).toBe(false);
  expect(isValidMotionValue(rgb, "#AABBCC")).toBe(true);
  for (const invalid of ["#abc", "#aabbccdd", "transparent"])
    expect(isValidMotionValue(rgb, invalid)).toBe(false);
});

it("accepts empty text while bounding strings and requiring a usable font family", () => {
  const text = descriptor("layer", "text"),
    font = descriptor("layer", "fontFamily");
  expect(isValidMotionValue(text, "")).toBe(true);
  expect(isValidMotionValue(text, "x".repeat(1_000_000))).toBe(true);
  expect(isValidMotionValue(text, "x".repeat(1_000_001))).toBe(false);
  expect(isValidMotionValue(font, "")).toBe(false);
  expect(isValidMotionValue(font, "x".repeat(256))).toBe(true);
  expect(isValidMotionValue(font, "x".repeat(257))).toBe(false);
  expect(isValidMotionValue(text, 42)).toBe(false);
});

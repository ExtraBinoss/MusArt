import { expect, test } from "vitest";
import { compileMotionInterpolator } from "../../src/motion/interpolation";
import { createMotionEasingPreset } from "../../src/motion/easing";
import type { MotionPropertyDescriptor } from "../../src/motion/properties/model";

const target = { kind: "layer", layerId: "hero", property: "opacity" } as const;
const numeric: MotionPropertyDescriptor = {
  target,
  kind: "number",
  value: 0,
  min: 0,
  max: 1,
  interpolation: "continuous",
};

test("numeric interpolation preserves valid bounds after overshooting easing", () => {
  const sample = compileMotionInterpolator(numeric, 0, 1, createMotionEasingPreset("easeOutBack"));
  expect(sample(-1)).toBe(0);
  expect(sample(1)).toBe(1);
  expect(sample(0.75)).toBe(1);
  expect(compileMotionInterpolator(numeric, 0, 1)(0.25)).toBe(0.25);
  const integer: MotionPropertyDescriptor = { ...numeric, kind: "integer", max: 10 };
  expect(compileMotionInterpolator(integer, 0, 9)(0.5)).toBe(5);
});

test("discrete descriptors hold until the destination regardless of spring overshoot", () => {
  const descriptors: [
    MotionPropertyDescriptor,
    number | string | boolean,
    number | string | boolean,
  ][] = [
    [{ ...numeric, kind: "integer", interpolation: "hold", max: 42 }, 1, 42],
    [{ target, kind: "boolean", interpolation: "hold", value: false }, false, true],
    [{ target, kind: "choice", interpolation: "hold", value: "a", options: ["a", "b"] }, "a", "b"],
    [
      { target, kind: "string", interpolation: "hold", value: "a", minLength: 0, maxLength: 100 },
      "a",
      "b",
    ],
  ];
  for (const [descriptor, before, after] of descriptors) {
    const sample = compileMotionInterpolator(
      descriptor,
      before,
      after,
      createMotionEasingPreset("bouncy"),
    );
    expect(sample(0.75)).toBe(before);
    expect(sample(1 - Number.EPSILON)).toBe(before);
    expect(sample(1)).toBe(after);
  }
});

test("interpolates straight RGB/RGBA paint with explicit alpha and channel clamping", () => {
  const rgba: MotionPropertyDescriptor = {
    target: { kind: "layer", layerId: "hero", property: "fill" },
    kind: "color",
    value: "#fff",
    format: "rgba",
    interpolation: "continuous",
  };
  expect(compileMotionInterpolator(rgba, "#f00", "#00f")(0.5)).toBe("#800080ff");
  expect(compileMotionInterpolator(rgba, "transparent", "#ffffff")(0.5)).toBe("#80808080");
  expect(compileMotionInterpolator(rgba, "#f008", "#00ff0080")(0.5)).toBe("#80800084");
  const rgb: MotionPropertyDescriptor = { ...rgba, format: "rgb", value: "#ffffff" };
  expect(compileMotionInterpolator(rgb, "#ff0000", "#0000ff")(0.5)).toBe("#800080");
  expect(
    compileMotionInterpolator(
      rgb,
      "#000000",
      "#ffffff",
      createMotionEasingPreset("easeOutBack"),
    )(0.75),
  ).toBe("#ffffff");
  const sample = compileMotionInterpolator(rgba, "TRANSPARENT", "#FFF");
  expect(sample(0)).toBe("TRANSPARENT");
  expect(sample(1)).toBe("#FFF");
});

test("captures descriptor bounds and easing independently of later caller mutations", () => {
  const descriptor = { ...numeric };
  const easing = { type: "cubicBezier", x1: 0, y1: 0, x2: 1, y2: 1 } as const;
  const mutable = { ...easing };
  const sample = compileMotionInterpolator(descriptor, 0, 1, mutable);
  descriptor.max = 0;
  Object.assign(mutable, { y1: 10, y2: 10 });
  expect(sample(0.5)).toBe(0.5);
});

test("rejects invalid authored values before sampling and nonfinite progress", () => {
  expect(() => compileMotionInterpolator(numeric, -1, 1)).toThrow();
  expect(() => compileMotionInterpolator(numeric, 0, NaN)).toThrow();
  expect(() => compileMotionInterpolator(numeric, false, true)).toThrow();
  const sample = compileMotionInterpolator(numeric, 0, 1);
  for (const progress of [NaN, Infinity, -Infinity]) expect(() => sample(progress)).toThrow();
});

import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import {
  createParameterUniforms,
  updateParameterUniforms,
} from "../../../src/effects/shared/parameters";

it("transports numeric, select, boolean and color settings through stable uniform objects", () => {
  const effect = createEffect("shatter");
  const controls = createParameterUniforms(effect);
  const radius = controls.parameters.radius!,
    pattern = controls.parameters.pattern!,
    cutout = controls.parameters.cutout!,
    tint = controls.colors.tintColor!,
    vector = tint.value;
  expect(radius.value).toBe(0.95);
  expect(pattern.value).toBe(0);
  expect(cutout.value).toBe(0);
  updateParameterUniforms(controls, {
    ...effect,
    settings: { radius: 0.7, pattern: "cellular", cutout: true, tintColor: "#ff8040" },
  });
  expect(controls.parameters.radius).toBe(radius);
  expect(controls.parameters.pattern).toBe(pattern);
  expect(controls.parameters.cutout).toBe(cutout);
  expect(controls.colors.tintColor).toBe(tint);
  expect(tint.value).toBe(vector);
  expect(radius.value).toBe(0.7);
  expect(pattern.value).toBe(1);
  expect(cutout.value).toBe(1);
  expect(vector.toArray()).toEqual([1, 128 / 255, 64 / 255]);
});

it("avoids duplicating Gradient's existing uniforms and leaves legacy effects unchanged", () => {
  const controls = createParameterUniforms(createEffect("gradient"));
  updateParameterUniforms(controls, createEffect("gradient"));
  expect(controls).toEqual({ parameters: {}, colors: {} });
  expect(createParameterUniforms(createEffect("dither"))).toEqual(controls);
});

it("reports malformed settings instead of creating invalid GPU values", () => {
  expect(() =>
    createParameterUniforms(createEffect("ripple", { settings: { radius: NaN } })),
  ).toThrow();
  expect(() =>
    createParameterUniforms(createEffect("shatter", { settings: { pattern: "invalid" } })),
  ).toThrow();
  const effect = createEffect("shatter"),
    controls = createParameterUniforms(effect);
  expect(() =>
    updateParameterUniforms(controls, { ...effect, settings: { tintColor: "invalid" } }),
  ).toThrow();
});

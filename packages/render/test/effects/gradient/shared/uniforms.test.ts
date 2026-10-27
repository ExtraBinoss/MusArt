import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import {
  createGradientUniforms,
  updateGradientUniforms,
} from "../../../../src/effects/gradient/shared/uniforms";
it("updates all palette/field settings in place with raw sRGB values and explicit deterministic time", () => {
  const effect = createEffect("gradient"),
    controls = createGradientUniforms(effect);
  const identity = { ...controls },
    color = controls.colors[0]!.value;
  expect(controls.time.value).toBe(0);
  updateGradientUniforms(controls, {
    ...effect,
    time: 3,
    seed: 2,
    scale: 0.5,
    settings: { preset: "custom", style: "waves", color0: "#804020", colorCount: 2, amplitude: 4 },
  });
  expect(controls.time.value).toBe(3);
  expect(controls.style.value).toBe(5);
  expect(controls.amplitude.value).toBe(4);
  expect(controls.scale.value).toBe(0.5);
  expect(controls.colors[0]!.value).toBe(color);
  expect(color.toArray()).toEqual([128 / 255, 64 / 255, 32 / 255]);
  for (const key of Object.keys(identity) as (keyof typeof controls)[])
    expect(controls[key]).toBe(identity[key]);
  updateGradientUniforms(controls, createEffect("gradient", { time: undefined }));
  expect(controls.time.value).toBe(0);
});

import { expect, it } from "vitest";
import { createEffect } from "../../../src/document/factories";
import { isEffectParameterVisible } from "../../../src/effects/parameters";
import {
  GRADIENT_DEFAULT_SETTINGS,
  GRADIENT_DEFINITION,
  resolveGradientSettings,
} from "../../../src/effects/gradient/definition";
it("resolves legacy partial data, named presets and explicit user overrides deterministically", () => {
  expect(resolveGradientSettings()).toEqual(GRADIENT_DEFAULT_SETTINGS);
  expect(resolveGradientSettings({ preset: "citrus", amplitude: 8 })).toMatchObject({
    style: "radial",
    amplitude: 8,
    colorCount: 5,
  });
  expect(resolveGradientSettings({ preset: "custom", style: "waves" })).toMatchObject({
    style: "waves",
    treatment: "none",
  });
  const first = createEffect("gradient"),
    second = createEffect("gradient");
  first.settings!.color0 = "#000000";
  expect(second.settings!.color0).toBe(GRADIENT_DEFAULT_SETTINGS.color0);
  expect(GRADIENT_DEFINITION.type).toBe("gradient");
  expect(Object.isFrozen(GRADIENT_DEFINITION.defaults.settings)).toBe(true);
});
it("exposes only real treatment-specific color and quantization controls", () => {
  const effect = createEffect("gradient"),
    color = GRADIENT_DEFINITION.parameters.find((parameter) => parameter.key === "color")!,
    levels = GRADIENT_DEFINITION.parameters.find((parameter) => parameter.key === "levels")!;
  expect(isEffectParameterVisible(effect, color)).toBe(false);
  expect(isEffectParameterVisible(effect, levels)).toBe(false);
  const ascii = { ...effect, settings: { treatment: "ascii" as const } };
  expect(isEffectParameterVisible(ascii, color)).toBe(true);
  expect(isEffectParameterVisible(ascii, levels)).toBe(false);
  const dither = { ...effect, settings: { treatment: "dither" as const } };
  expect(isEffectParameterVisible(dither, color)).toBe(true);
  expect(isEffectParameterVisible(dither, levels)).toBe(true);
});

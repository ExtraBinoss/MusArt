import { expect, it } from "vitest";
import { createEffect } from "../../../src/document/factories";
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

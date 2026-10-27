import { expect, it } from "vitest";
import { createEffect } from "../../src/document/factories";
import { getEffectDefinition } from "../../src/effects/catalog";
import {
  getEffectParameter,
  isEffectParameterVisible,
  patchEffectParameter,
  validateEffectParameter,
} from "../../src/effects/parameters";
const gradient = createEffect("gradient");
const parameter = (key: string) =>
  getEffectDefinition("gradient").parameters.find((item) => item.key === key)!;
it("applies named presets atomically, edits independent settings and preserves legacy controls", () => {
  const patch = patchEffectParameter(gradient, parameter("preset"), "citrus");
  expect(patch).toMatchObject({
    seed: 79,
    scale: 0.9,
    settings: { style: "radial", preset: "citrus" },
  });
  const edited = patchEffectParameter({ ...gradient, ...patch }, parameter("color0"), "#123456");
  expect(edited.settings).toMatchObject({ color0: "#123456", preset: "custom", style: "radial" });
  expect(gradient.settings!.color0).not.toBe("#123456");
  expect(
    patchEffectParameter(
      createEffect("dither"),
      getEffectDefinition("dither").parameters[0]!,
      0.25,
    ),
  ).toEqual({ amount: 0.25 });
  expect(getEffectParameter({ ...gradient, time: undefined }, parameter("time"))).toBe(0);
  expect(isEffectParameterVisible(gradient, parameter("refraction"))).toBe(false);
  expect(
    isEffectParameterVisible(
      { ...gradient, settings: { treatment: "glass" } },
      parameter("refraction"),
    ),
  ).toBe(true);
  expect(isEffectParameterVisible(gradient, parameter("color5"))).toBe(false);
  expect(isEffectParameterVisible(gradient, parameter("amount"))).toBe(true);
});
it("rejects invalid choices, colors, numbers, foreign descriptors and noninteger palette sizes", () => {
  for (const [key, value] of [
    ["preset", "bad"],
    ["color0", "red"],
    ["colorCount", 2.5],
    ["time", Infinity],
    ["colored", 1],
  ] as const) {
    const item = parameter(key === "colored" ? "color" : key);
    expect(() => validateEffectParameter(item, value)).toThrow();
  }
  expect(() => patchEffectParameter(createEffect("dither"), parameter("preset"), "silk")).toThrow();
  expect(() =>
    getEffectParameter(gradient, {
      kind: "number",
      key: "levels",
      labelKey: "",
      min: 1,
      max: 2,
      step: 1,
      displayScale: 1,
      unit: "",
      scope: "settings",
    } as never),
  ).toThrow();
});

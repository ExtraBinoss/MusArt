import { expect, it } from "vitest";
import { createEffect } from "../../../src/document/factories";
import { validateEffectParameter } from "../../../src/effects/parameters";
import {
  SHATTER_DEFAULT_SETTINGS,
  SHATTER_DEFINITION,
  SHATTER_PARAMETERS,
} from "../../../src/effects/shatter/definition";

it("defines deterministic bounded settings and an optional protected-center radial gizmo", () => {
  expect(SHATTER_DEFINITION.type).toBe("shatter");
  expect(SHATTER_DEFINITION.defaults).toMatchObject({ amount: 1, scale: 72, seed: 42 });
  expect(SHATTER_DEFAULT_SETTINGS).toMatchObject({
    pattern: "impact",
    cutout: false,
    innerRadius: 0,
    ior: 1.52,
  });
  expect(SHATTER_DEFINITION.gizmo).toEqual({
    kind: "radial",
    centerX: "centerX",
    centerY: "centerY",
    radius: "radius",
    innerRadius: "innerRadius",
    radiusUnits: "relative-min",
  });
  expect(Object.isFrozen(SHATTER_DEFINITION)).toBe(true);
  expect(Object.isFrozen(SHATTER_DEFINITION.gizmo)).toBe(true);
  expect(Object.isFrozen(SHATTER_DEFAULT_SETTINGS)).toBe(true);
  const keys = SHATTER_PARAMETERS.map((parameter) => parameter.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(
    SHATTER_DEFINITION.parameters.find((parameter) => parameter.key === "spokes"),
  ).toMatchObject({ integer: true, visibleWhen: { key: "pattern", values: ["impact"] } });
});
it("validates defaults and both numeric extremes while rejecting out-of-contract values", () => {
  for (const parameter of SHATTER_PARAMETERS) {
    const value =
      parameter.scope === "settings"
        ? SHATTER_DEFAULT_SETTINGS[parameter.key]
        : SHATTER_DEFINITION.defaults[parameter.key as "amount"];
    expect(() => validateEffectParameter(parameter, value, "INVALID_DOCUMENT")).not.toThrow();
    if (parameter.kind === "number") {
      expect(() =>
        validateEffectParameter(parameter, parameter.min, "INVALID_DOCUMENT"),
      ).not.toThrow();
      expect(() =>
        validateEffectParameter(parameter, parameter.max, "INVALID_DOCUMENT"),
      ).not.toThrow();
      expect(() =>
        validateEffectParameter(parameter, parameter.min - parameter.step, "INVALID_DOCUMENT"),
      ).toThrow();
      expect(() => validateEffectParameter(parameter, Number.NaN, "INVALID_DOCUMENT")).toThrow();
      expect(() =>
        validateEffectParameter(parameter, parameter.max + parameter.step, "INVALID_DOCUMENT"),
      ).toThrow();
    }
    if (parameter.kind === "select")
      expect(() =>
        validateEffectParameter(parameter, "foreign-pattern", "INVALID_DOCUMENT"),
      ).toThrow();
    if (parameter.kind === "boolean")
      expect(() => validateEffectParameter(parameter, "false", "INVALID_DOCUMENT")).toThrow();
    if (parameter.kind === "color")
      expect(() =>
        validateEffectParameter(parameter, "url(foreign)", "INVALID_DOCUMENT"),
      ).toThrow();
  }
});
it("gives each created effect detached settings while preserving the immutable catalogue defaults", () => {
  const first = createEffect("shatter"),
    second = createEffect("shatter");
  first.settings!.centerX = 0.1;
  first.settings!.cutout = true;
  expect(second.settings).toMatchObject({ centerX: 0.5, cutout: false });
  expect(SHATTER_DEFAULT_SETTINGS).toMatchObject({ centerX: 0.5, cutout: false });
});

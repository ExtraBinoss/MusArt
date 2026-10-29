import { expect, it } from "vitest";
import { createEffect } from "../../../src/document/factories";
import { validateEffectParameter } from "../../../src/effects/parameters";
import {
  CRT_DEFAULT_SETTINGS,
  CRT_DEFINITION,
  CRT_PARAMETERS,
} from "../../../src/effects/crt/definition";

it("defines three phosphor masks, explicit time and opt-in screen clipping", () => {
  expect(CRT_DEFINITION).toMatchObject({
    type: "crt",
    nameKey: "crtFx:name",
    defaults: { amount: 1, scale: 1.5, seed: 42, time: 0 },
  });
  expect(CRT_DEFAULT_SETTINGS).toMatchObject({
    mask: "aperture",
    cutout: false,
    scanlinePitch: 3,
    tintColor: "#ffffff",
  });
  expect(Object.isFrozen(CRT_DEFAULT_SETTINGS)).toBe(true);
  expect(Object.isFrozen(CRT_DEFINITION)).toBe(true);
  const keys = CRT_PARAMETERS.map((parameter) => parameter.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(CRT_PARAMETERS.find((p) => p.key === "mask")).toMatchObject({
    options: [{ value: "aperture" }, { value: "shadow" }, { value: "slot" }],
  });
});

it("validates defaults and both parameter bounds while rejecting malformed settings", () => {
  for (const parameter of CRT_PARAMETERS) {
    const value =
      parameter.scope === "settings"
        ? CRT_DEFAULT_SETTINGS[parameter.key]
        : CRT_DEFINITION.defaults[parameter.key as "amount"];
    expect(() => validateEffectParameter(parameter, value, "INVALID_DOCUMENT")).not.toThrow();
    if (parameter.kind === "number") {
      for (const bound of [parameter.min, parameter.max])
        expect(() => validateEffectParameter(parameter, bound, "INVALID_DOCUMENT")).not.toThrow();
      for (const invalid of [parameter.min - parameter.step, parameter.max + parameter.step, NaN])
        expect(() => validateEffectParameter(parameter, invalid, "INVALID_DOCUMENT")).toThrow();
    } else if (parameter.kind === "select") {
      for (const option of parameter.options)
        expect(() =>
          validateEffectParameter(parameter, option.value, "INVALID_DOCUMENT"),
        ).not.toThrow();
      expect(() =>
        validateEffectParameter(parameter, "foreign-mask", "INVALID_DOCUMENT"),
      ).toThrow();
    } else if (parameter.kind === "color") {
      expect(() => validateEffectParameter(parameter, "url(image)", "INVALID_DOCUMENT")).toThrow();
    } else {
      expect(() => validateEffectParameter(parameter, "false", "INVALID_DOCUMENT")).toThrow();
    }
  }
});

it("detaches created settings from defaults and other instances", () => {
  const first = createEffect("crt"),
    second = createEffect("crt");
  first.settings!.mask = "slot";
  first.settings!.cutout = true;
  expect(second.settings).toMatchObject({ mask: "aperture", cutout: false });
  expect(CRT_DEFAULT_SETTINGS).toMatchObject({ mask: "aperture", cutout: false });
});

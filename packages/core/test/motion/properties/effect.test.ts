import { expect, it } from "vitest";
import { createEffect } from "../../../src/document/factories";
import { EFFECT_CATALOG } from "../../../src/effects/catalog";
import {
  EFFECT_MOTION_PROPERTIES,
  effectMotionCapabilityInventory,
  effectMotionSchema,
  effectSettingProperties,
  readEffectMotionValue,
} from "../../../src/motion/properties/effect";
import { isValidMotionValue } from "../../../src/motion/properties/validation";

it("covers every effect definition and all its root/settings parameter scopes", () => {
  for (const definition of Object.values(EFFECT_CATALOG)) {
    const effect = createEffect(definition.type);
    for (const property of EFFECT_MOTION_PROPERTIES) {
      const schema = effectMotionSchema(effect, property, false)!;
      expect(schema, `${effect.type}.${property}`).not.toBeNull();
      expect(
        isValidMotionValue(schema, readEffectMotionValue(effect, property, false)),
        `${effect.type}.${property}`,
      ).toBe(true);
    }
    const inventory = effectMotionCapabilityInventory(effect.type);
    const macros = inventory.filter((item) => item.status === "macro");
    const settings = definition.parameters.filter(
      (parameter) =>
        parameter.scope === "settings" && !macros.some((macro) => macro.property === parameter.key),
    );
    expect(effectSettingProperties(effect)).toEqual(settings.map((parameter) => parameter.key));
    for (const parameter of definition.parameters) {
      const setting = parameter.scope === "settings";
      const capability = inventory.find(
        (item) =>
          item.property === parameter.key && item.kind === (setting ? "effectSetting" : "effect"),
      );
      expect(capability).toBeDefined();
      if (capability?.status === "macro") {
        expect(capability.reason).toMatch(/multi-parameter authoring macro/);
        expect(effectMotionSchema(effect, parameter.key, setting)).toBeNull();
        continue;
      }
      const schema = effectMotionSchema(effect, parameter.key, setting)!;
      expect(schema, `${effect.type}.${parameter.key}`).not.toBeNull();
      expect(
        isValidMotionValue(schema, readEffectMotionValue(effect, parameter.key, setting)),
      ).toBe(true);
      if (parameter.kind === "color")
        expect(schema).toMatchObject({ kind: "color", format: "rgb" });
      if (parameter.kind === "select")
        expect(schema).toMatchObject({
          kind: "choice",
          interpolation: "hold",
          options: parameter.options.map((option) => option.value),
        });
      if (parameter.kind === "number" && parameter.integer)
        expect(schema.interpolation).toBe("hold");
    }
  }
});

it("retains document scale bounds, integer seed semantics and optional defaults", () => {
  const gradient = createEffect("gradient");
  expect(effectMotionSchema(gradient, "scale", false)).toMatchObject({ min: 0.1, max: 128 });
  expect(effectMotionSchema(gradient, "seed", false)).toMatchObject({
    kind: "integer",
    interpolation: "hold",
  });
  const dither = createEffect("dither");
  for (const [property, value] of [
    ["time", 0],
    ["opacity", 1],
    ["blendMode", "normal"],
    ["composite", "default"],
  ] as const) {
    expect(readEffectMotionValue(dither, property, false)).toBe(value);
  }
  expect(effectMotionSchema(gradient, "color5", true)).not.toBeNull();
  expect(effectMotionSchema(createEffect("noise"), "octaves", true)).toMatchObject({
    kind: "integer",
    interpolation: "hold",
  });
});

it("rejects foreign settings, prototype keys, unknown effects and scope confusion", () => {
  const effect = createEffect("dither");
  expect(effectMotionSchema(effect, "color0", true)).toBeNull();
  expect(readEffectMotionValue(effect, "color0", true)).toBeUndefined();
  expect(effectMotionSchema(effect, "amount", true)).toBeNull();
  expect(effectMotionSchema(createEffect("gradient"), "color0", false)).toBeNull();
  for (const key of ["__proto__", "constructor", "type", "settings.color0"]) {
    expect(effectMotionSchema(effect, key, false)).toBeNull();
    expect(readEffectMotionValue(effect, key, false)).toBeUndefined();
  }
  const unknown = { ...effect, type: "missing" as never };
  expect(effectMotionSchema(unknown, "amount", false)).toBeNull();
  expect(effectSettingProperties(unknown)).toEqual([]);
  expect(readEffectMotionValue(unknown, "amount", false)).toBeUndefined();
  expect(effectMotionCapabilityInventory(unknown.type)).toEqual([]);
});

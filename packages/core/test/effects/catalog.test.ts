import { describe, expect, it } from "vitest";
import { EFFECT_CATALOG, getEffectDefinition } from "../../src/effects/catalog";
import { createEffect, createLayer } from "../../src/document/factories";
import type { EffectType } from "../../src/document/model";

describe("portable effect definitions", () => {
  it("describes every supported effect once, with the existing deterministic defaults", () => {
    expect(Object.keys(EFFECT_CATALOG)).toEqual([
      "dither",
      "ascii",
      "brightness",
      "contrast",
      "grayscale",
      "blur",
    ]);
    expect(getEffectDefinition("dither")).toMatchObject({
      type: "dither",
      nameKey: "dither",
      defaults: { enabled: true, amount: 1, scale: 2, levels: 2, color: false, seed: 42 },
    });
    expect(getEffectDefinition("ascii").defaults).toMatchObject({
      amount: 1,
      scale: 10,
      levels: 10,
      color: true,
    });
    expect(getEffectDefinition("brightness").defaults.amount).toBe(0.5);
    expect(getEffectDefinition("contrast").defaults.amount).toBe(0.5);
    expect(getEffectDefinition("grayscale").defaults.amount).toBe(1);
    expect(getEffectDefinition("blur").defaults.scale).toBe(2);
  });
  it("provides typed controls in document units and meaningful display metadata", () => {
    const expected: Record<EffectType, string[]> = {
      dither: ["amount", "scale", "levels", "color"],
      ascii: ["amount", "scale", "color"],
      brightness: ["amount"],
      contrast: ["amount"],
      grayscale: ["amount"],
      blur: ["amount", "scale"],
    };
    for (const definition of Object.values(EFFECT_CATALOG)) {
      expect(definition.parameters.map((parameter) => parameter.key)).toEqual(
        expected[definition.type],
      );
      expect(getEffectDefinition(definition.type)).toBe(definition);
      for (const parameter of definition.parameters) {
        expect(parameter.labelKey.length).toBeGreaterThan(0);
        if (parameter.kind === "boolean")
          expect(typeof definition.defaults[parameter.key]).toBe("boolean");
        else {
          const value = definition.defaults[parameter.key];
          expect(value).toBeGreaterThanOrEqual(parameter.min);
          expect(value).toBeLessThanOrEqual(parameter.max);
          expect(parameter.step).toBeGreaterThan(0);
          expect(parameter.displayScale).toBeGreaterThan(0);
          if (parameter.key === "amount")
            expect(parameter).toMatchObject({
              min: 0,
              max: 1,
              step: 0.01,
              displayScale: 100,
              unit: "%",
            });
          if (parameter.key === "scale") expect(parameter.unit).toBe("px");
        }
      }
    }
    expect(
      getEffectDefinition("ascii").parameters.find((parameter) => parameter.key === "scale"),
    ).toMatchObject({ max: 48 });
    expect(
      getEffectDefinition("dither").parameters.find((parameter) => parameter.key === "scale"),
    ).toMatchObject({ max: 24 });
  });
  it("keeps shared definitions deeply immutable while factories produce independent effect instances", () => {
    const definition = getEffectDefinition("dither");
    expect(Object.isFrozen(EFFECT_CATALOG)).toBe(true);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.defaults)).toBe(true);
    expect(Object.isFrozen(definition.parameters)).toBe(true);
    expect(Object.isFrozen(definition.parameters[0])).toBe(true);
    const first = createEffect("dither", { amount: 0.2 });
    const second = createEffect("dither");
    expect(first.id).not.toBe(second.id);
    first.scale = 10;
    expect(second.scale).toBe(2);
    expect(definition.defaults.amount).toBe(1);
    expect(definition.defaults.scale).toBe(2);
    expect(createLayer("text").fontFamily).toBe("Inter");
  });
  it("rejects unknown names and prototype keys at the public catalogue boundary", () => {
    expect(() => getEffectDefinition("unknown" as never)).toThrow("Effet inconnu");
    expect(() => getEffectDefinition("toString" as never)).toThrow("Effet inconnu");
    expect(() => createEffect("unknown" as never)).toThrow("Effet inconnu");
  });
});

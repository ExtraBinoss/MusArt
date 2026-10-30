import { expect, test } from "vitest";
import { createEffect, getEffectDefinition, resolveEffectSettings } from "../../../src/index";
test("declares source geometry with bounded progress and letter timing controls", () => {
  const definition = getEffectDefinition("morph");
  expect(definition.source).toBe("geometry");
  const defaults = resolveEffectSettings(createEffect("morph"));
  expect(defaults).toMatchObject({ progress: 1, stagger: 0.45, order: "forward" });
  for (const parameter of definition.parameters)
    if (parameter.kind === "number" && parameter.scope === "settings") {
      expect(defaults[parameter.key]).toBeGreaterThanOrEqual(parameter.min);
      expect(defaults[parameter.key]).toBeLessThanOrEqual(parameter.max);
    }
});

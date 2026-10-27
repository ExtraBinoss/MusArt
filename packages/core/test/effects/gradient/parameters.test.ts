import { expect, it } from "vitest";
import { GRADIENT_PARAMETERS } from "../../../src/effects/gradient/parameters";
import { validateEffectParameter } from "../../../src/effects/parameters";
it("declares every bounded control once with valid defaults and treatment-specific fields", () => {
  expect(new Set(GRADIENT_PARAMETERS.map((parameter) => parameter.key)).size).toBe(
    GRADIENT_PARAMETERS.length,
  );
  for (const parameter of GRADIENT_PARAMETERS) {
    if ("default" in parameter)
      expect(() => validateEffectParameter(parameter, parameter.default)).not.toThrow();
    if (parameter.kind === "number") {
      expect(parameter.step).toBeGreaterThan(0);
      expect(() => validateEffectParameter(parameter, parameter.min - 1)).toThrow();
      expect(() => validateEffectParameter(parameter, parameter.max + 1)).toThrow();
    }
  }
  expect(GRADIENT_PARAMETERS.find((parameter) => parameter.key === "refraction")).toMatchObject({
    visibleWhen: { key: "treatment", values: ["glass"] },
  });
});

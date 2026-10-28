import { expect, it } from "vitest";
import { getEffectDefinition } from "@musart/core";
import {
  gradientFxEn,
  gradientFxFr,
} from "../../../../src/components/properties/effects/gradient-messages";
it("translates every Gradient descriptor and choice in both app locales", () => {
  for (const messages of [gradientFxEn, gradientFxFr])
    for (const parameter of getEffectDefinition("gradient").parameters) {
      const keys = [
        parameter.labelKey,
        ...(parameter.kind === "select" ? parameter.options.map((option) => option.labelKey) : []),
      ];
      for (const key of keys.filter((key) => key.startsWith("gradientFx:"))) {
        const path = key.split(":")[1]!.split(".");
        let value: unknown = messages;
        for (const part of path) value = (value as Record<string, unknown>)[part];
        expect(typeof value, key).toBe("string");
        expect(String(value).length).toBeGreaterThan(0);
      }
    }
});

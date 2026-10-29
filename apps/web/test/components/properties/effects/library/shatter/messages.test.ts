import { expect, it } from "vitest";
import messages from "../../../../../../src/components/properties/effects/library/shatter/messages.json";
import { getEffectDefinition } from "@musart/core";

it("translates every Shatter-specific parameter and pattern choice in English and French", () => {
  const definition = getEffectDefinition("shatter");
  const keys = [
    definition.nameKey,
    ...definition.parameters.flatMap((parameter) => [
      parameter.labelKey,
      ...(parameter.kind === "select" ? parameter.options.map((option) => option.labelKey) : []),
    ]),
  ];
  for (const language of ["en", "fr"] as const) {
    for (const key of keys.filter((key) => key.startsWith("shatterFx:"))) {
      let value: unknown = messages[language];
      for (const segment of key.slice("shatterFx:".length).split("."))
        value = (value as Record<string, unknown>)[segment];
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(0);
    }
  }
  expect(messages.fr.name).toBe("Verre brisé");
});

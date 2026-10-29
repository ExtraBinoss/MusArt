import { expect, it } from "vitest";
import messages from "../../../../../../src/components/properties/effects/library/receipt/messages.json";
import { getEffectDefinition } from "@musart/core";

it("translates every Receipt parameter, print mode and edge variant in English and French", () => {
  const definition = getEffectDefinition("receipt"),
    keys = [
      definition.nameKey,
      ...definition.parameters.flatMap((p) => [
        p.labelKey,
        ...(p.kind === "select" ? p.options.map((option) => option.labelKey) : []),
      ]),
    ];
  for (const language of ["en", "fr"] as const)
    for (const key of keys.filter((key) => key.startsWith("receiptFx:"))) {
      let value: unknown = messages[language];
      for (const segment of key.slice("receiptFx:".length).split("."))
        value = (value as Record<string, unknown>)[segment];
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(0);
    }
  expect(messages.fr.name).toBe("Ticket de caisse");
});

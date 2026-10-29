import { expect, it } from "vitest";
import { getEffectDefinition, type EffectType } from "@musart/core";
import { libraryMessages } from "../../../../src/components/properties/effects/library-messages";
import { i18n } from "../../../../src/state/i18n";
import "../../../../src/components/properties/effects/messages";

function paths(value: object, prefix = ""): string[] {
  return Object.entries(value)
    .flatMap(([key, child]) =>
      typeof child === "string" ? [`${prefix}${key}`] : paths(child, `${prefix}${key}.`),
    )
    .sort();
}
it("registers matching English/French names and every owned parameter label", () => {
  for (const [type, messages] of Object.entries(libraryMessages)) {
    expect(paths(messages.en)).toEqual(paths(messages.fr));
    for (const lng of ["en", "fr"]) {
      expect(i18n.t(type, { lng })).toBe(messages[lng as "en" | "fr"].name);
      expect(i18n.t(`${type}Fx:name`, { lng })).toBe(messages[lng as "en" | "fr"].name);
      for (const parameter of getEffectDefinition(type as EffectType).parameters)
        expect(i18n.t(parameter.labelKey, { lng })).not.toBe(parameter.labelKey);
    }
  }
});

import { expect, test } from "vitest";
import { messages } from "../../../../src/components/toolbar/segmentation/messages";
import { i18n } from "../../../../src/state/i18n";
test("registers matching English and French model controls and progress descriptions", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  for (const locale of ["en", "fr"] as const)
    for (const [key, value] of Object.entries(messages[locale]))
      expect(i18n.getResource(locale, "localModel", key)).toBe(value);
});

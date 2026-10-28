import { expect, test } from "vitest";
import { i18n } from "../../../src/state/i18n";
import { messages } from "../../../src/components/search/messages";
test("registers matching English and French search resources", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  for (const language of ["en", "fr"] as const)
    for (const [key, value] of Object.entries(messages[language])) {
      expect(value.length).toBeGreaterThan(0);
      expect(i18n.getResource(language, "search", key)).toBe(value);
    }
});

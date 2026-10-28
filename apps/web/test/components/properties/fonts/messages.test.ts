import { expect, test } from "vitest";
import { messages } from "../../../../src/components/properties/fonts/messages";
import { i18n } from "../../../../src/state/i18n";

test("registers matching font search, preview and category labels in both languages", () => {
  expect(Object.keys(messages.en)).toEqual(Object.keys(messages.fr));
  expect(Object.keys(messages.en.category)).toEqual(Object.keys(messages.fr.category));
  expect(i18n.t("category.mono", { ns: "fonts", lng: "fr" })).toBe("Chasse fixe");
  expect(i18n.t("search", { ns: "fonts", lng: "en" })).toBe("Search fonts");
});

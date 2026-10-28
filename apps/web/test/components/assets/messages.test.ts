import { expect, test } from "vitest";
import { messages } from "../../../src/components/assets/messages";
import { i18n } from "../../../src/state/i18n";
test("registers matching localized vector-library labels and interpolations", () => {
  expect(Object.keys(messages.fr)).toEqual(Object.keys(messages.en));
  expect(Object.keys(messages.fr.names)).toEqual(Object.keys(messages.en.names));
  expect(i18n.t("use", { ns: "assets", lng: "en", name: "Star" })).toBe("Use Star");
  expect(i18n.t("names.heart", { ns: "assets", lng: "fr" })).toBe("Cœur");
  expect(i18n.t("search", { ns: "assets", lng: "fr" })).toBe("Rechercher");
  expect(i18n.t("search", { ns: "assets", lng: "en" })).toBe("Search");
});

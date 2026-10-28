import { expect, test } from "vitest";
import { translations } from "../../../src/state/i18n/catalogs";
test("ships matching French and English catalogs", () => {
  expect(Object.keys(translations.fr.translation).sort()).toEqual(
    Object.keys(translations.en.translation).sort(),
  );
  expect(translations.fr.translation.layers).toBe("Calques");
});

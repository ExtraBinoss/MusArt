import { expect, test } from "vitest";
import { messages } from "../../../../src/components/layers/catalog/messages";
import { EFFECT_FAMILIES } from "../../../../src/components/layers/catalog/model";
import { i18n } from "../../../../src/state/i18n";
test("category and filter copy is registered in English and French", () => {
  for (const language of ["fr", "en"] as const) {
    expect(Object.keys(messages[language].family).sort()).toEqual([...EFFECT_FAMILIES].sort());
    for (const key of [
      "search",
      "searchAdjustment",
      "familyLabel",
      "all",
      "empty",
      "emptyAdjustment",
    ] as const)
      expect(i18n.getFixedT(language)(`effectCatalog:${key}`)).toBe(messages[language][key]);
  }
});

import { expect, test } from "vitest";
import { EFFECT_CATALOG } from "@musart/core";
import {
  EFFECT_FAMILY,
  effectCatalogEntries,
  filterEffectCatalog,
  normalizeEffectSearch,
} from "../../../../src/components/layers/catalog/model";
import { i18n } from "../../../../src/state/i18n";
import "../../../../src/components/layers/catalog/messages";
import "../../../../src/components/properties/effects/library-messages";
import "../../../../src/components/motion/transitions/messages";

test("every registered effect has exactly one presentation family and retains its core category", () => {
  expect(Object.keys(EFFECT_FAMILY).sort()).toEqual(Object.keys(EFFECT_CATALOG).sort());
  for (const category of ["effect", "adjustment"] as const) {
    const entries = effectCatalogEntries(category, i18n.getFixedT("fr"), "fr");
    expect(entries.map((entry) => entry.type).sort()).toEqual(
      Object.values(EFFECT_CATALOG)
        .filter((item) => item.category === category)
        .map((item) => item.type)
        .sort(),
    );
    expect(entries.map((entry) => entry.label)).toEqual(
      entries
        .map((entry) => entry.label)
        .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base", numeric: true })),
    );
  }
});
test("search matches localized names, durable IDs and families, with accent-insensitive AND terms", () => {
  const entries = effectCatalogEntries("effect", i18n.getFixedT("fr"), "fr");
  expect(normalizeEffectSearch("  ÉCRANS  ")).toBe("ecrans");
  expect(filterEffectCatalog(entries, "FlOu", "all").map((entry) => entry.type)).toEqual(["blur"]);
  expect(filterEffectCatalog(entries, "ombre", "all").map((entry) => entry.type)).toEqual([
    "shadow",
  ]);
  expect(filterEffectCatalog(entries, "pink-phosphor", "all").map((entry) => entry.type)).toEqual([
    "pink-phosphor",
  ]);
  expect(
    filterEffectCatalog(entries, "retro ecrans", "all").every((entry) => entry.family === "retro"),
  ).toBe(true);
  expect(filterEffectCatalog(entries, "blur", "texture")).toEqual([]);
  expect(filterEffectCatalog(entries, "", "color").every((entry) => entry.family === "color")).toBe(
    true,
  );
  expect(filterEffectCatalog(entries, "absent-query", "all")).toEqual([]);
});

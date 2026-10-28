import { expect, it } from "vitest";
import { i18n } from "../../../../src/state/i18n";
import { messages } from "../../../../src/services/selection/wand/messages";
it.each(["en", "fr"] as const)("registers complete pixel-selection controls in %s", (lng) => {
  for (const [key, value] of Object.entries(messages[lng]))
    if (!value.includes("{{")) expect(i18n.t(`pixelSelection:${key}`, { lng })).toBe(value);
  expect(i18n.t("pixelSelection:tolerance", { lng, value: 42 })).toContain("42");
  expect(i18n.t("pixelSelection:selected", { lng, count: 6 })).toContain("6");
});

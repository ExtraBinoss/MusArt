import { expect, it } from "vitest";
import { i18n } from "../../../src/state/i18n";
import "../../../src/canvas/quick-add/messages";
it("provides English/French quick insertion labels and real unavailable feedback", () => {
  expect(i18n.getFixedT("en", "quickAdd")("addArtboard")).toBe("Add artboard");
  expect(i18n.getFixedT("fr", "quickAdd")("title")).toBe("Ajout rapide");
  expect(i18n.getFixedT("en", "quickAdd")("unavailable")).toContain("unavailable");
});

import { expect, it } from "vitest";
import { i18n } from "../../../../src/state/i18n";
import "../../../../src/components/properties/color/messages";
it("provides English and French native sampling labels and real failure messages", () => {
  expect(i18n.getFixedT("en", "color")("sample")).toBe("Pick a screen color");
  expect(i18n.getFixedT("fr", "color")("sample")).toContain("Prélever");
  expect(i18n.getFixedT("en", "color")("failed")).toContain("failed");
});

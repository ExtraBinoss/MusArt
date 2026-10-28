import { expect, test } from "vitest";
import { i18n } from "../../../../src/state/i18n";
import "../../../../src/components/projects/templates/messages";
test("keeps template search and editable artwork descriptions translated in both languages", () => {
  expect(i18n.getResource("en", "templates", "search")).toBe("Search templates");
  expect(i18n.getResource("fr", "templates", "editable")).toContain("150 calques");
});

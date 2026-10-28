import { expect, test } from "vitest";
import { i18n } from "../../../src/state/i18n";
import "../../../src/components/export/messages";
test("registers localized export scope and real failure text", () => {
  expect(i18n.getResource("en", "exportPanel", "whole")).toBe("Whole artboard");
  expect(i18n.getResource("fr", "exportPanel", "exportFailed")).toContain("échoué");
});

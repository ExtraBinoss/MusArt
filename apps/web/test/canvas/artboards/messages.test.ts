import { expect, it } from "vitest";
import { i18n } from "../../../src/state/i18n";
import "../../../src/canvas/artboards/messages";
it("provides localized artboard CRUD, previews and accessible names", () => {
  expect(i18n.getFixedT("en", "artboards")("activate", { name: "Cover" })).toBe("Edit Cover");
  expect(i18n.getFixedT("fr", "artboards")("rename")).toContain("Renommer");
  expect(i18n.getFixedT("en", "artboards")("unavailable")).toContain("unavailable");
});

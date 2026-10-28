import { expect, test } from "vitest";
import { projectMessages } from "../../../src/state/i18n/projects";
import { i18n } from "../../../src/state/i18n";
test("keeps CRUD, storage estimates, journal confirmations and carousel controls localized", () => {
  expect(Object.keys(projectMessages.fr).sort()).toEqual(Object.keys(projectMessages.en).sort());
  expect(i18n.t("clearNamedHistory", { lng: "en", name: "Study" })).toContain("Study");
  expect(i18n.t("logicalStorageHint", { lng: "fr" })).toContain("allocation réelle");
  expect(i18n.t("pageUnit", { lng: "en", count: 2 })).toBe("pages");
});

import { expect, test } from "vitest";
import { interfaceV2 } from "../../../src/state/i18n/interface-v2";
test("keeps every new interface control translated in both languages", () => {
  expect(Object.keys(interfaceV2.fr).sort()).toEqual(Object.keys(interfaceV2.en).sort());
  expect(interfaceV2.fr.adjustValue).toContain("{{label}}");
  expect(interfaceV2.en.adjustValue).toContain("{{label}}");
  expect(
    Object.values(interfaceV2.fr).every((value) =>
      typeof value === "string"
        ? value.length > 0
        : Object.values(value).every((text) => text.length > 0),
    ),
  ).toBe(true);
  expect(
    Object.values(interfaceV2.en).every((value) =>
      typeof value === "string"
        ? value.length > 0
        : Object.values(value).every((text) => text.length > 0),
    ),
  ).toBe(true);
});

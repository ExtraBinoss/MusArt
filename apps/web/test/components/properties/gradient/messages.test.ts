import { expect, test } from "vitest";
import { messages } from "../../../../src/components/properties/gradient/messages";
import { i18n } from "../../../../src/state/i18n";

test("registers equivalent gradient controls in both interface languages", () => {
  expect(Object.keys(messages.fr)).toEqual(Object.keys(messages.en));
  expect(i18n.t("stop", { ns: "gradient", lng: "en", number: 3 })).toBe("Stop 3");
  expect(i18n.t("stopColor", { ns: "gradient", lng: "fr", number: 2 })).toBe("Couleur du point 2");
});

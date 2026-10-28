import { expect, test } from "vitest";
import { messages } from "../../../src/components/animation/messages";
import { i18n } from "../../../src/state/i18n";
test("registers matching localized history, playback, encoding errors and command labels", () => {
  expect(Object.keys(messages.fr).sort()).toEqual(Object.keys(messages.en).sort());
  expect(Object.keys(messages.fr.commands).sort()).toEqual(
    Object.keys(messages.en.commands).sort(),
  );
  expect(i18n.t("commands.undo", { ns: "animation", lng: "fr" })).toBe("Annuler");
  expect(i18n.t("noCodec", { ns: "animation", lng: "en" })).toContain("WebM");
  expect(i18n.t("exporting", { ns: "animation", lng: "fr", percent: 50 })).toBe("Encodage 50 %");
});

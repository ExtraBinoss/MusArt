import { expect, test } from "vitest";
import { i18n } from "../../../src/state/i18n";
import { messages } from "../../../src/components/motion-import/messages";

test("describes the actual group-aware conversion and cancellation in English and French", () => {
  for (const language of ["en", "fr"] as const) {
    expect(Object.keys(messages[language])).toEqual(Object.keys(messages.en));
    for (const key of Object.keys(messages.en))
      expect(i18n.getResource(language, "motionImport", key)).toBeTruthy();
  }
  expect(messages.en.groups).toContain("Effect and property rows are not counted");
  expect(messages.fr.cancel).toContain("annuler");
});

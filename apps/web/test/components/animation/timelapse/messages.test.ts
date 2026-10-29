import { expect, test } from "vitest";
import { i18n } from "../../../../src/state/i18n";
import { messages } from "../../../../src/components/animation/timelapse/messages";

test("registers complete French and English Timelapse messages", () => {
  expect(Object.keys(messages.fr).sort()).toEqual(Object.keys(messages.en).sort());
  for (const language of ["fr", "en"] as const)
    for (const key of Object.keys(messages[language]))
      expect(i18n.getResource(language, "timelapse", key)).toBeTruthy();
  expect(messages.fr.durationHint).toContain("30");
  expect(messages.en.durationHint).toContain("30");
});

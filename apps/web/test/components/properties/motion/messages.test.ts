import { expect, test } from "vitest";
import { i18n } from "../../../../src/state/i18n";
import { messages } from "../../../../src/components/properties/motion/messages";
test("registers matching French and English keyframe messages", () => {
  expect(Object.keys(messages.en)).toEqual(Object.keys(messages.fr));
  for (const language of ["en", "fr"] as const)
    for (const key of Object.keys(messages[language]))
      expect(i18n.getResource(language, "motionProperties", key)).toBeTruthy();
});

import { expect, test } from "vitest";
import { i18n } from "../../../src/state/i18n";
import { messages } from "../../../src/components/notifications/messages";
test("provides localized close/copy/details labels", () => {
  for (const language of ["en", "fr"] as const)
    for (const key of Object.keys(messages.en))
      expect(i18n.getResource(language, "notices", key)).toBeTruthy();
});

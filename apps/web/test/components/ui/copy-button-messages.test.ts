import { expect, test } from "vitest";
import { i18n } from "../../../src/state/i18n";
import { messages } from "../../../src/components/ui/copy-button-messages";
test("translates copy acknowledgement and real failure feedback in both languages", () => {
  for (const language of ["en", "fr"] as const)
    for (const key of Object.keys(messages.en))
      expect(i18n.getResource(language, "copyButton", key)).toBeTruthy();
});

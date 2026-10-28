import { expect, test } from "vitest";
import { i18n } from "../../../../src/state/i18n";
import "../../../../src/components/search/keybindings/messages";
test("explains persistence, collision recovery and directional commands in both languages", () => {
  for (const lng of ["en", "fr"]) {
    for (const key of [
      "description",
      "collision",
      "storage",
      "stale",
      "nudgeLeft",
      "nudgeDownLarge",
    ])
      expect(i18n.t(`keybindings:${key}`, { lng, command: "Undo" })).not.toContain(
        `keybindings:${key}`,
      );
  }
});

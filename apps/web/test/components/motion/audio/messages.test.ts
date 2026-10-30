import { expect, it } from "vitest";
import { messages } from "../../../../src/components/motion/audio/messages";
it("keeps all audio controls localized in English and French", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  expect(messages.fr.trimEnd).toContain("fin");
});

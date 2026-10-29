import { expect, it } from "vitest";
import { messages } from "../../../src/components/motion/messages";

it("provides matching nonempty English/French controls, validation and count messages", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  for (const language of [messages.en, messages.fr]) {
    expect(Object.values(language).every((value) => value.trim().length > 0)).toBe(true);
    expect(language.enableDescription).toContain("{{count}}");
    expect(language.keys).toContain("{{count}}");
    expect(language.changed).not.toBe(language.failed);
  }
});

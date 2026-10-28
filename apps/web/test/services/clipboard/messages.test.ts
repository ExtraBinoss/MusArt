import { expect, it } from "vitest";
import { messages } from "../../../src/services/clipboard/messages";
it("provides matching nonempty English and French clipboard failures", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  expect(Object.values(messages.en).every((message) => message.length > 0)).toBe(true);
  expect(Object.values(messages.fr).every((message) => message.length > 0)).toBe(true);
});

import { expect, it } from "vitest";
import { messages } from "../../src/bootstrap/messages";
it("provides matching English and French startup messages", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  expect(messages.en.opening).toBe("Opening your studio…");
});

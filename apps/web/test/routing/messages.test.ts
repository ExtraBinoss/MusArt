import { expect, test } from "vitest";
import { messages } from "../../src/routing/messages";
test("navigation names have matching French and English resources", () => {
  expect(Object.keys(messages.fr).sort()).toEqual(Object.keys(messages.en).sort());
});

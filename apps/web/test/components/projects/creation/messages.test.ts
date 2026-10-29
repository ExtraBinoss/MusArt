import { expect, test } from "vitest";
import { messages } from "../../../../src/components/projects/creation/messages";
test("English and French provide matching nonempty interface strings", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  for (const value of [...Object.values(messages.en), ...Object.values(messages.fr)])
    expect(value.trim()).not.toBe("");
});

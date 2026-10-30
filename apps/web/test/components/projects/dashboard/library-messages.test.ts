import { expect, test } from "vitest";
import { messages } from "../../../../src/components/projects/dashboard/library-messages";
test("library labels have matching nonempty English and French strings", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  for (const value of [...Object.values(messages.en), ...Object.values(messages.fr)])
    expect(value.trim()).not.toBe("");
});

import { expect, test } from "vitest";
import { messages } from "../../../../src/components/projects/dashboard/messages";
test("dashboard copy has matching nonempty English and French keys", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  for (const value of [...Object.values(messages.en), ...Object.values(messages.fr)])
    expect(value.trim()).not.toBe("");
});

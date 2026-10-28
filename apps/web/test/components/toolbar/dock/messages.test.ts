import { expect, test } from "vitest";
import { messages } from "../../../../src/components/toolbar/dock/messages";
test("dock strings have matching nonempty English and French keys", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  for (const value of [...Object.values(messages.en), ...Object.values(messages.fr)])
    expect(value.length).toBeGreaterThan(0);
});

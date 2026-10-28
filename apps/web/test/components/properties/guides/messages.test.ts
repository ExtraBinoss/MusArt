import { expect, test } from "vitest";
import { messages } from "../../../../src/components/properties/guides/messages";
test("guide-preset resources have complete English and French parity", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  for (const value of [...Object.values(messages.en), ...Object.values(messages.fr)])
    expect(value).not.toBe("");
});

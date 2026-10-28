import { expect, test } from "vitest";
import { messages } from "../../../src/components/layers/messages";
test("layer controls expose matching English and French resources", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  for (const value of [...Object.values(messages.en), ...Object.values(messages.fr)])
    expect(value.trim()).not.toBe("");
});

import { expect, test } from "vitest";
import { messages } from "../../../../src/components/shared/scroll/messages";
test("horizontal scroll labels have matching English and French interpolation", () => {
  expect(Object.keys(messages.en)).toEqual(Object.keys(messages.fr));
  for (const value of [...Object.values(messages.en), ...Object.values(messages.fr)])
    expect(value).toContain("{{label}}");
});

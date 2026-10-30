import { expect, test } from "vitest";
import { messages } from "../../../../../src/components/projects/templates/motion-preview/messages";
test("live preview status text is available in English and French", () => {
  expect(Object.keys(messages.en)).toEqual(Object.keys(messages.fr));
  for (const value of [...Object.values(messages.en), ...Object.values(messages.fr)])
    expect(value.trim()).not.toBe("");
});

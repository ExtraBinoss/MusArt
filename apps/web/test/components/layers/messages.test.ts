import { expect, test } from "vitest";
import { messages } from "../../../src/components/layers/messages";
test("layer controls expose matching English and French resources", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  expect(Object.keys(messages.en.dropRejected).sort()).toEqual(
    Object.keys(messages.fr.dropRejected).sort(),
  );
  for (const value of [...Object.values(messages.en), ...Object.values(messages.fr)]) {
    for (const text of typeof value === "string" ? [value] : Object.values(value))
      expect(text.trim()).not.toBe("");
  }
  expect(messages.en.lockedState).toBe("Locked");
  expect(messages.fr.lockedState).toBe("Verrouillé");
  expect(messages.en.lockedByParent).toBe("Locked by {{name}}");
  expect(messages.fr.lockedByParent).toBe("Verrouillé par {{name}}");
});

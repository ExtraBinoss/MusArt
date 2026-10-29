import { expect, test } from "vitest";
import { messages } from "../../../../src/components/properties/locked/messages";
test("locked-layer notice has complete nonempty English and French resources", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  for (const value of [...Object.values(messages.en), ...Object.values(messages.fr)])
    expect(value.trim()).not.toBe("");
  expect(messages.fr.locked).toBe("Ce calque est verrouillé");
  expect(messages.fr.unlock).toBe("Déverrouiller");
});

import { expect, test } from "vitest";
import { messages } from "../../../src/components/onboarding/messages";
import { brand } from "../../../src/ui/brand/config";

test("every welcome explanation and control is available in English and French", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  for (const value of [...Object.values(messages.en), ...Object.values(messages.fr)])
    expect(value.trim()).not.toBe("");
  for (const locale of [messages.en, messages.fr]) {
    expect(locale.welcome).toContain(brand.name);
    expect(locale.introLabel).toContain(brand.name.toUpperCase());
    expect(locale.saveDetail1).toMatch(/browser|navigateur/i);
    expect(locale.saveDetail2).toContain(".musart");
  }
});

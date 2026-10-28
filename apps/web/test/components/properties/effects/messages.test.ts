import { expect, test } from "vitest";
import { EFFECT_COMPOSITE_MODES } from "@musart/core";
import { messages } from "../../../../src/components/properties/effects/messages";
test("every real alpha composition and seed control has English and French labels", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  for (const locale of [messages.en, messages.fr]) {
    for (const mode of EFFECT_COMPOSITE_MODES)
      expect(locale.operation[mode].length).toBeGreaterThan(0);
    expect(locale.seed.length).toBeGreaterThan(0);
    expect(locale.falloff.length).toBeGreaterThan(0);
    expect(locale.replacement.length).toBeGreaterThan(0);
  }
});

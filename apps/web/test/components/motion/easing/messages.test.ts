import { expect, it } from "vitest";
import { MOTION_EASING_PRESETS } from "@musart/core";
import { messages } from "../../../../src/components/motion/easing/messages";

it("translates every actual engine preset and curve-editor action in both languages", () => {
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  for (const language of [messages.en, messages.fr]) {
    for (const preset of MOTION_EASING_PRESETS) expect(language[preset].length).toBeGreaterThan(0);
    expect(language.incoming).not.toBe(language.holdHint);
    expect(language.handle).toContain("{{number}}");
  }
});

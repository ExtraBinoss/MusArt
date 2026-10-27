import { expect, it } from "vitest";
import { GRADIENT_PRESETS, gradientPresetSettings } from "../../../src/effects/gradient/presets";
it("has deterministic distinct presets with complete padded palettes and independent settings", () => {
  expect(new Set(GRADIENT_PRESETS.map((preset) => preset.id)).size).toBe(9);
  for (const preset of GRADIENT_PRESETS) {
    const settings = gradientPresetSettings(preset);
    expect(settings.preset).toBe(preset.id);
    expect(settings.colorCount).toBe(preset.colors.length);
    expect(settings.color0).toBe(preset.colors[0]);
    expect(settings.color5).toBe(preset.colors.at(-1));
    settings.color0 = "#000000";
    expect(gradientPresetSettings(preset).color0).toBe(preset.colors[0]);
    expect(Object.isFrozen(preset)).toBe(true);
  }
});

import { expect, test } from "vitest";
import { render } from "@testing-library/react";
import { SOCIAL_PRESETS } from "@musart/core";
import { PresetPreview } from "../../../../src/components/properties/guides/PresetPreview";

test.each(SOCIAL_PRESETS)(
  "$id previews its own real aspect ratio and catalog safe area",
  (preset) => {
    const view = render(<PresetPreview preset={preset} />),
      format = view.container.querySelector<HTMLElement>(".guide-preset-format")!,
      width = Number.parseFloat(format.style.width),
      height = Number.parseFloat(format.style.height),
      safe = view.container.querySelector<HTMLElement>(".guide-preset-safe-area");
    expect(width / height).toBeCloseTo(preset.width / preset.height, 10);
    expect(Math.max(width, height)).toBeCloseTo(76, 10);
    expect(format.style.aspectRatio).toBe(`${preset.width} / ${preset.height}`);
    expect(format).toHaveAttribute("data-format-width", String(preset.width));
    expect(format).toHaveAttribute("data-format-height", String(preset.height));
    if (preset.safeArea) {
      expect(safe).not.toBeNull();
      expect(Number.parseFloat(safe!.style.top)).toBeCloseTo(
        (preset.safeArea.top / preset.height) * 100,
      );
      expect(Number.parseFloat(safe!.style.left)).toBeCloseTo(
        (preset.safeArea.left / preset.width) * 100,
      );
    } else expect(safe).toBeNull();
  },
);

import type { CompositionPreset } from "@musart/core";
import { templatePreview } from "../../projects/templates/preview";

/** Decoration uses the real format ratio and only the safe area provided by its catalog entry. */
export function PresetPreview({ preset }: { preset: CompositionPreset }) {
  const scale = 76 / Math.max(preset.width, preset.height),
    safe = preset.safeArea;
  return (
    <span className="guide-preset-preview" data-guide-preset={preset.id} aria-hidden="true">
      <span
        className="guide-preset-format"
        data-format-width={preset.width}
        data-format-height={preset.height}
        style={{
          width: preset.width * scale,
          height: preset.height * scale,
          aspectRatio: `${preset.width} / ${preset.height}`,
          background: templatePreview(preset.id),
        }}
      >
        {safe && (
          <span
            className="guide-preset-safe-area"
            style={{
              top: `${(safe.top / preset.height) * 100}%`,
              right: `${(safe.right / preset.width) * 100}%`,
              bottom: `${(safe.bottom / preset.height) * 100}%`,
              left: `${(safe.left / preset.width) * 100}%`,
            }}
          />
        )}
      </span>
    </span>
  );
}

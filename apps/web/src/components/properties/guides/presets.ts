import { createId, safeAreaGuides, type CompositionPreset, type Guide } from "@musart/core";

/** Fit an actual format inside the target; these editable framing guides make no safe-zone guarantee. */
export function guidePresetFrame(
  bounds: { width: number; height: number },
  preset: Pick<CompositionPreset, "width" | "height">,
) {
  const scale = Math.min(bounds.width / preset.width, bounds.height / preset.height),
    width = preset.width * scale,
    height = preset.height * scale;
  return { x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height };
}
export function guidesFromPreset(
  bounds: { width: number; height: number },
  preset: CompositionPreset,
): Guide[] {
  const frame = guidePresetFrame(bounds, preset),
    guides: Guide[] = [
      { id: createId("guide"), axis: "x", position: frame.x },
      { id: createId("guide"), axis: "x", position: frame.x + frame.width },
      { id: createId("guide"), axis: "y", position: frame.y },
      { id: createId("guide"), axis: "y", position: frame.y + frame.height },
    ];
  if (preset.safeArea) {
    const scale = frame.width / preset.width;
    guides.push(
      ...safeAreaGuides(
        frame.width,
        frame.height,
        {
          top: preset.safeArea.top * scale,
          right: preset.safeArea.right * scale,
          bottom: preset.safeArea.bottom * scale,
          left: preset.safeArea.left * scale,
        },
        createId("safe"),
      ).map((guide) => ({
        ...guide,
        position: guide.position + (guide.axis === "x" ? frame.x : frame.y),
      })),
    );
  }
  return guides;
}

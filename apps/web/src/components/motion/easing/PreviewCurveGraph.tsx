import { useSyncExternalStore } from "react";
import type { MotionEasing } from "@musart/core";
import { CurveGraph } from "./CurveGraph";
import type { EasingPreview } from "./preview";

/** Only the graph subscribes to preset hover/focus; the surrounding form remains retained. */
export function PreviewCurveGraph({
  preview,
  easing,
  onChange,
  disabled = false,
}: {
  preview: EasingPreview;
  easing: MotionEasing;
  onChange(this: void, value: MotionEasing): void;
  disabled?: boolean;
}) {
  const hovered = useSyncExternalStore(preview.subscribe, preview.read, preview.read);
  return (
    <CurveGraph
      easing={hovered ?? easing}
      onChange={onChange}
      disabled={disabled || hovered !== null}
    />
  );
}

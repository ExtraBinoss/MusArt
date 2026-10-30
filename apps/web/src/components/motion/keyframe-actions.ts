import type { TimelineGestures } from "./gestures";
type KeySelection = Pick<TimelineGestures, "readSelected" | "selectKey" | "deleteSelected">;
export type CapturedKeyframeDelete = (() => void) & { readonly count: number };

/** Context and keyboard delete own an exact selection; a later selection cannot be removed by an old menu. */
export function captureKeyframeDelete(
  gestures: KeySelection,
  keyId: string,
  selectLayer: () => void,
): CapturedKeyframeDelete {
  if (!gestures.readSelected().has(keyId)) {
    gestures.selectKey(keyId, false);
    selectLayer();
  }
  const captured = new Set(gestures.readSelected());
  let active = true;
  const remove = () => {
    if (!active) return;
    active = false;
    const selected = gestures.readSelected();
    if (
      !captured.size ||
      selected.size !== captured.size ||
      [...captured].some((id) => !selected.has(id))
    )
      return;
    gestures.deleteSelected();
  };
  return Object.assign(remove, { count: captured.size });
}

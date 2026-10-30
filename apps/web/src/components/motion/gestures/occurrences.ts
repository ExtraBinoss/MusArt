import {
  getDescendants,
  addMotionTime,
  compareMotionTime,
  type Composition,
  type MotionLayerTrack,
  type MotionTime,
} from "@musart/core";

/** A v2 move previews only its occurrence and channel keys, never an entire canonical row. */
export function previewOccurrenceMove(
  root: HTMLElement,
  trackId: string,
  keyIds: readonly string[],
  pixels: number,
  touched: Set<HTMLElement>,
): void {
  const keys = new Set(keyIds);
  for (const node of root.querySelectorAll<HTMLElement>(
    ".motion-track-wrap[data-track-id],.motion-key[data-key-id]",
  )) {
    if (node.dataset.trackId !== trackId && !keys.has(node.dataset.keyId!)) continue;
    node.style.setProperty("--motion-drag-x", `${pixels}px`);
    touched.add(node);
  }
}

/** Invalid overlap stops the preview at its last accepted position; final validation is authoritative. */
export function acceptsOccurrencePlacement(
  page: Composition,
  track: MotionLayerTrack,
  action: "move" | "trimStart" | "trimEnd",
  delta: MotionTime,
): boolean {
  if (page.motion?.version !== 2) return true;
  const start = action === "trimEnd" ? track.start : addMotionTime(track.start, delta);
  const previousEnd = track.end ?? page.motion.duration;
  const end = action === "trimStart" ? previousEnd : addMotionTime(previousEnd, delta);
  return !page.motion.tracks.some(
    (sibling) =>
      sibling.id !== track.id &&
      sibling.layerId === track.layerId &&
      compareMotionTime(start, sibling.end ?? page.motion!.duration) < 0 &&
      compareMotionTime(sibling.start, end) < 0,
  );
}

/** Legacy group movement owns descendants; v2 movement owns one occurrence's channels. */
export function occurrenceMoveTargets(page: Composition, layerId: string, trackId?: string) {
  const layerIds = new Set(
    page.motion?.version === 2
      ? [layerId]
      : getDescendants(page, [layerId]).map((layer) => layer.id),
  );
  layerIds.add(layerId);
  const keyIds = (page.motion?.tracks ?? [])
    .filter((track) =>
      page.motion?.version === 2 ? track.id === trackId : layerIds.has(track.layerId),
    )
    .flatMap((track) =>
      track.properties.flatMap((property) => property.keyframes.map((key) => key.id)),
    );
  return { layerIds, keyIds };
}

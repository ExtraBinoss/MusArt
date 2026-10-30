import {
  projectMotionProperties,
  getDescendants,
  addMotionTime,
  compareMotionTime,
  type Composition,
  type MotionLayerTrack,
  type MotionTime,
  planMotionTrackMove,
  acceptsMotionTrackMove,
  type MotionTrackMovePlan,
  subtractMotionTime,
} from "@musart/core";

/** Preview the explicit occurrence set and its keys without moving unrelated row occurrences. */
export function previewOccurrenceMove(
  root: HTMLElement,
  trackId: string | ReadonlySet<string>,
  keyIds: readonly string[] | ReadonlySet<string>,
  pixels: number,
  touched: Set<HTMLElement>,
): void {
  const keys = "has" in keyIds ? keyIds : new Set(keyIds);
  const tracks = typeof trackId === "string" ? new Set([trackId]) : trackId;
  for (const node of root.querySelectorAll<HTMLElement>(
    ".motion-track-wrap[data-track-id],.motion-key[data-key-id]",
  )) {
    if (!tracks.has(node.dataset.trackId!) && !keys.has(node.dataset.keyId!)) continue;
    node.style.setProperty("--motion-drag-x", `${pixels}px`);
    touched.add(node);
  }
}

export function timelineGestureBounds(
  page: Composition,
  action: "keys" | "move" | "trimStart" | "trimEnd",
  track: MotionLayerTrack | undefined,
  keyIds: ReadonlySet<string>,
  plan?: MotionTrackMovePlan,
) {
  if (action === "move" && track) return plan ?? planMotionTrackMove(page, track.id);
  const zero = { value: 0, rate: 1 },
    duration = page.motion!.duration;
  if (track) {
    const end = track.end ?? duration,
      span = subtractMotionTime(end, track.start);
    const tick =
      compareMotionTime(span, { value: 1, rate: 1000000 }) < 0 ? span : { value: 1, rate: 1000000 };
    return action === "trimStart"
      ? { minimum: subtractMotionTime(zero, track.start), maximum: subtractMotionTime(span, tick) }
      : { minimum: subtractMotionTime(tick, span), maximum: subtractMotionTime(duration, end) };
  }
  const times = page.motion!.tracks.flatMap((item) =>
    projectMotionProperties(item).flatMap((property) =>
      property.keyframes.filter((key) => keyIds.has(key.id)).map((key) => key.time),
    ),
  );
  let first = times[0] ?? zero,
    last = first;
  for (const time of times) {
    if (compareMotionTime(time, first) < 0) first = time;
    if (compareMotionTime(time, last) > 0) last = time;
  }
  return { minimum: subtractMotionTime(zero, first), maximum: subtractMotionTime(duration, last) };
}

/** Invalid overlap stops the preview at its last accepted position; final validation is authoritative. */
export function acceptsOccurrencePlacement(
  page: Composition,
  track: MotionLayerTrack,
  action: "move" | "trimStart" | "trimEnd",
  delta: MotionTime,
  plan?: MotionTrackMovePlan,
): boolean {
  if (action === "move")
    return acceptsMotionTrackMove(page, plan ?? planMotionTrackMove(page, track.id), delta);
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

/** A group occurrence includes descendant tracks; unrelated parent occurrences stay independent. */
export function occurrenceMoveTargets(
  page: Composition,
  layerId: string,
  trackId?: string,
  plan?: MotionTrackMovePlan,
) {
  if (trackId) {
    const move = plan ?? planMotionTrackMove(page, trackId);
    return {
      layerIds: new Set(move.layerIds),
      keyIds: [...move.keyframeIds],
      trackIds: new Set(move.trackIds),
    };
  }
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
      projectMotionProperties(track).flatMap((property) => property.keyframes.map((key) => key.id)),
    );
  return { layerIds, keyIds, trackIds: new Set<string>() };
}

import type { Composition } from "../document/model";
import { ensure } from "../errors";
import { getDescendants } from "../layers/geometry";
import { getLayer } from "../layers/access";
import {
  addMotionTime,
  compareMotionTime,
  subtractMotionTime,
  validateMotionTime,
  type MotionTime,
} from "./time";

export interface MotionTrackMovePlan {
  readonly trackIds: readonly string[];
  readonly layerIds: readonly string[];
  readonly keyframeIds: readonly string[];
  readonly minimum: MotionTime;
  readonly maximum: MotionTime;
}
const zero: MotionTime = Object.freeze({ value: 0, rate: 1 });

/** A selected group occurrence owns its descendants' timing; sibling parent occurrences stay independent. */
export function planMotionTrackMove(page: Composition, trackId: string): MotionTrackMovePlan {
  const motion = page.motion;
  ensure(motion, "INVALID_COMMAND", "Composition has no Motion timeline");
  const selected = motion.tracks.find((track) => track.id === trackId);
  ensure(selected, "NOT_FOUND", "Track not found");
  const layer = getLayer(page, selected.layerId);
  const descendants = new Set(getDescendants(page, [layer.id]).map((child) => child.id));
  descendants.delete(layer.id);
  const tracks = motion.tracks.filter(
    (track) =>
      track.id === selected.id ||
      descendants.has(track.layerId) ||
      (motion.version === 1 && track.layerId === layer.id),
  );
  let first = selected.start,
    last = selected.end ?? motion.duration;
  const keys: string[] = [];
  for (const track of tracks) {
    if (compareMotionTime(track.start, first) < 0) first = track.start;
    const end = track.end ?? motion.duration;
    if (compareMotionTime(end, last) > 0) last = end;
    for (const property of track.properties)
      for (const key of property.keyframes) {
        keys.push(key.id);
        // v2 deliberately retains signed pre-roll keys; legacy timelines reject negative key times.
        if (motion.version === 1 && compareMotionTime(key.time, first) < 0) first = key.time;
      }
  }
  return Object.freeze({
    trackIds: Object.freeze(tracks.map((track) => track.id)),
    layerIds: Object.freeze([...new Set(tracks.map((track) => track.layerId))]),
    keyframeIds: Object.freeze(keys),
    minimum: subtractMotionTime(zero, first),
    maximum: subtractMotionTime(motion.duration, last),
  });
}

/** UI placement is bounded; explicit command callers may still request duration extension. */
export function clampMotionTrackMove(
  plan: Pick<MotionTrackMovePlan, "minimum" | "maximum">,
  delta: MotionTime,
) {
  validateMotionTime(delta);
  if (compareMotionTime(plan.minimum, plan.maximum) > 0)
    return { delta: zero, boundary: delta.value < 0 ? ("start" as const) : ("end" as const) };
  if (compareMotionTime(delta, plan.minimum) <= 0)
    return { delta: plan.minimum, boundary: "start" as const };
  if (compareMotionTime(delta, plan.maximum) >= 0)
    return { delta: plan.maximum, boundary: "end" as const };
  return { delta, boundary: null };
}

/** Validate all moved occurrences against stationary siblings, keeping internal relative timing. */
export function acceptsMotionTrackMove(
  page: Composition,
  plan: MotionTrackMovePlan,
  delta: MotionTime,
) {
  const motion = page.motion;
  if (!motion) return false;
  const ids = new Set(plan.trackIds);
  const stationary = new Map<string, typeof motion.tracks>();
  for (const track of motion.tracks)
    if (!ids.has(track.id)) {
      const siblings = stationary.get(track.layerId) ?? [];
      siblings.push(track);
      stationary.set(track.layerId, siblings);
    }
  for (const track of motion.tracks) {
    if (!ids.has(track.id)) continue;
    const start = addMotionTime(track.start, delta),
      end = addMotionTime(track.end ?? motion.duration, delta);
    if (start.value < 0 || compareMotionTime(start, end) >= 0) return false;
    if (motion.version !== 2) continue;
    if (
      (stationary.get(track.layerId) ?? []).some(
        (other) =>
          compareMotionTime(start, other.end ?? motion.duration) < 0 &&
          compareMotionTime(other.start, end) < 0,
      )
    )
      return false;
  }
  return true;
}

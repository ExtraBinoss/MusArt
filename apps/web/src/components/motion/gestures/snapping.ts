import { motionTimeToSeconds, type MotionTime } from "@musart/core";

export interface TimelineSnapReference {
  readonly seconds: number;
  readonly time: MotionTime;
}

/** Binary-search sorted references, keeping their exact rational time and stable tie order. */
export function nearestTimelineSnap(
  references: readonly TimelineSnapReference[],
  target: number,
  playhead: MotionTime,
  pixelsPerSecond: number,
): MotionTime | null {
  if (!(pixelsPerSecond > 0)) return null;
  let low = 0,
    high = references.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (references[middle]!.seconds < target) low = middle + 1;
    else high = middle;
  }
  const previous = references[low - 1],
    next = references[low];
  const initial = previous ?? next;
  let time = initial?.time ?? playhead;
  let distance = Math.abs((initial?.seconds ?? motionTimeToSeconds(playhead)) - target);
  if (next && Math.abs(next.seconds - target) < distance) {
    time = next.time;
    distance = Math.abs(next.seconds - target);
  }
  const playheadDistance = Math.abs(motionTimeToSeconds(playhead) - target);
  if (playheadDistance < distance) {
    time = playhead;
    distance = playheadDistance;
  }
  return distance * pixelsPerSecond <= 6 ? time : null;
}

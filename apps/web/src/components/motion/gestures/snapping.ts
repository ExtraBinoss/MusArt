import {
  projectMotionProperties,
  motionTimeToSeconds,
  type Composition,
  type MotionTime,
} from "@musart/core";

export interface TimelineSnapReference {
  readonly seconds: number;
  readonly time: MotionTime;
}

/** Collect once at gesture capture; pointer updates only binary-search this retained list. */
export function timelineSnapReferences(
  page: Composition,
  movingKeys: ReadonlySet<string>,
): TimelineSnapReference[] {
  const references: TimelineSnapReference[] = [{ seconds: 0, time: { value: 0, rate: 1 } }];
  if (page.motion)
    references.push({
      seconds: motionTimeToSeconds(page.motion.duration),
      time: page.motion.duration,
    });
  for (const track of page.motion?.tracks ?? [])
    for (const property of projectMotionProperties(track))
      for (const key of property.keyframes)
        if (!movingKeys.has(key.id))
          references.push({ seconds: motionTimeToSeconds(key.time), time: key.time });
  return references.sort((a, b) => a.seconds - b.seconds);
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

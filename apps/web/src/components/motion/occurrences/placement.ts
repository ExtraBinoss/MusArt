import {
  addMotionTime,
  compareMotionTime,
  listLayerMotionOccurrences,
  subtractMotionTime,
  type Composition,
  type MotionLayerTrack,
  type MotionTime,
} from "@musart/core";
export interface OccurrencePlacement {
  start: MotionTime;
  end: MotionTime;
  source?: MotionLayerTrack;
}
/** Suggest a finite copy inside a real empty interval; the engine remains authoritative. */
export function planOccurrencePlacement(
  page: Composition,
  layerId: string,
  start: MotionTime,
  selectedId?: string,
): OccurrencePlacement | undefined {
  if (!page.motion || start.value < 0 || compareMotionTime(start, page.motion.duration) >= 0)
    return;
  const tracks = listLayerMotionOccurrences(page, layerId);
  let gapEnd = page.motion.duration;
  for (const track of tracks) {
    const end = track.end ?? page.motion.duration;
    if (compareMotionTime(track.start, start) <= 0 && compareMotionTime(start, end) < 0) return;
    if (compareMotionTime(track.start, start) > 0) {
      gapEnd = track.start;
      break;
    }
  }
  const source =
    tracks.find((track) => track.id === selectedId) ??
    tracks.reduce<MotionLayerTrack | undefined>((nearest, track) => {
      if (!nearest) return track;
      const distance = (candidate: MotionLayerTrack) => {
        const end = candidate.end ?? page.motion!.duration;
        const fromStart = subtractMotionTime(candidate.start, start);
        const fromEnd = subtractMotionTime(end, start);
        return Math.min(
          Math.abs(fromStart.value / fromStart.rate),
          Math.abs(fromEnd.value / fromEnd.rate),
        );
      };
      return distance(track) < distance(nearest) ? track : nearest;
    }, undefined);
  const span = source
    ? subtractMotionTime(source.end ?? page.motion.duration, source.start)
    : { value: 2, rate: 1 };
  if (span.value <= 0) return;
  const desired = addMotionTime(start, span);
  const end = compareMotionTime(desired, gapEnd) < 0 ? desired : gapEnd;
  return compareMotionTime(start, end) < 0
    ? { start, end, ...(source ? { source } : {}) }
    : undefined;
}

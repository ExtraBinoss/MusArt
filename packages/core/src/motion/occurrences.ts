import type { Composition } from "../document/model";
import { isPublishedComposition } from "../document/published";
import { ensure } from "../errors";
import type { MotionLayerTrack } from "./model";
import { compareMotionTime, validateMotionTime, type MotionTime } from "./time";

const indexes = new WeakMap<Composition, ReadonlyMap<string, readonly MotionLayerTrack[]>>();
const empty: readonly MotionLayerTrack[] = Object.freeze([]);

function occurrenceIndex(page: Composition): ReadonlyMap<string, readonly MotionLayerTrack[]> {
  const published = isPublishedComposition(page);
  const retained = published ? indexes.get(page) : undefined;
  if (retained) return retained;
  const index = new Map<string, MotionLayerTrack[]>();
  for (const track of page.motion?.tracks ?? []) {
    const siblings = index.get(track.layerId) ?? [];
    siblings.push(track);
    index.set(track.layerId, siblings);
  }
  for (const siblings of index.values()) {
    siblings.sort((a, b) => compareMotionTime(a.start, b.start));
    if (published) Object.freeze(siblings);
  }
  if (published) indexes.set(page, index);
  return index;
}

/** Canonical layer order is separate from this time-ordered list of independent occurrences. */
export function listLayerMotionOccurrences(
  page: Composition,
  layerId: string,
): readonly MotionLayerTrack[] {
  return occurrenceIndex(page).get(layerId) ?? empty;
}

/** Half-open placement, with an explicit left-limit option only at the composition endpoint. */
export function getMotionOccurrenceAt(
  page: Composition,
  layerId: string,
  time: MotionTime,
  options: { terminalPreview?: boolean } = {},
): MotionLayerTrack | undefined {
  validateMotionTime(time);
  const motion = page.motion;
  if (!motion) return;
  const bound = compareMotionTime(time, motion.duration);
  const terminal = options.terminalPreview === true && bound === 0;
  if (time.value < 0 || bound > 0 || (bound === 0 && !terminal)) return;
  const tracks = listLayerMotionOccurrences(page, layerId);
  let low = 0,
    high = tracks.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const order = compareMotionTime(tracks[middle]!.start, time);
    if (terminal ? order < 0 : order <= 0) low = middle + 1;
    else high = middle;
  }
  const track = tracks[low - 1];
  if (!track) return;
  const end = compareMotionTime(time, track.end ?? motion.duration);
  return (terminal ? end <= 0 : end < 0) ? track : undefined;
}

/** Commands must never silently edit the first occurrence of an ambiguous layer. */
export function resolveMotionOccurrence(
  page: Composition,
  layerId: string,
  trackId?: string,
  time?: MotionTime,
): MotionLayerTrack {
  const tracks = listLayerMotionOccurrences(page, layerId);
  const track =
    trackId !== undefined
      ? tracks.find((item) => item.id === trackId)
      : tracks.length === 1
        ? tracks[0]
        : time
          ? getMotionOccurrenceAt(page, layerId, time, { terminalPreview: true })
          : undefined;
  ensure(track, "NOT_FOUND", "Choose a Motion occurrence for this layer and time");
  return track;
}

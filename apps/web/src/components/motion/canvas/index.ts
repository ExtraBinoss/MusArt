import { motionTimeToSeconds, resolveLayerMotionProperty } from "@musart/core";
import type { MotionKeyframe, MotionLayerTrack } from "@musart/core";
import type { TimelineRow } from "../tree";
import { createTimelineIntervalIndex } from "./intervals";

export interface CanvasIndexedKey {
  readonly key: MotionKeyframe;
  readonly index: number;
  readonly time: number;
}
export interface CanvasIndexedRow {
  readonly row: TimelineRow;
  readonly tracks: readonly MotionLayerTrack[];
  readonly tracksById: ReadonlyMap<string, MotionLayerTrack>;
  readonly keys: readonly CanvasIndexedKey[];
  readonly continuous: boolean;
  queryTracks(start: number, end: number): MotionLayerTrack[];
}
export interface TimelineCanvasIndex {
  get(index: number): CanvasIndexedRow | undefined;
}
const cache = new WeakMap<readonly TimelineRow[], TimelineCanvasIndex>();
const MAX_ROWS = 64;

function prepareTracks(row: TimelineRow) {
  const tracks = [...(row.occurrences ?? (row.track ? [row.track] : []))].sort(
    (a, b) => motionTimeToSeconds(a.start) - motionTimeToSeconds(b.start),
  );
  return {
    tracks,
    byId: new Map(tracks.map((track) => [track.id, track])),
    query: createTimelineIntervalIndex(tracks, (track) => ({
      start: motionTimeToSeconds(track.start),
      end: track.end ? motionTimeToSeconds(track.end) : Infinity,
    })),
  };
}

/** Only consulted rows allocate temporal indexes; an immutable revision retains at most 64. */
export function indexTimelineCanvas(rows: readonly TimelineRow[]): TimelineCanvasIndex {
  const existing = cache.get(rows);
  if (existing) return existing;
  const recent = new Map<number, CanvasIndexedRow>();
  const index: TimelineCanvasIndex = {
    get(at) {
      const row = rows[at];
      if (!row) return;
      const retained = recent.get(at);
      if (retained) {
        recent.delete(at);
        recent.set(at, retained);
        return retained;
      }
      // Key-only rows never request an occurrence index, but retain the same API
      // when a caller explicitly asks for their owner's temporal tracks.
      let temporal: ReturnType<typeof prepareTracks> | undefined;
      const trackIndex = () => (temporal ??= prepareTracks(row));
      const indexed: CanvasIndexedRow = {
        row,
        get tracks() {
          return trackIndex().tracks;
        },
        get tracksById() {
          return trackIndex().byId;
        },
        keys:
          row.kind === "property"
            ? row.property.keyframes.map((key, index) => ({
                key,
                index,
                time: motionTimeToSeconds(key.time),
              }))
            : [],
        continuous:
          row.kind === "property" &&
          resolveLayerMotionProperty(row.layer, row.property.target)?.interpolation ===
            "continuous",
        queryTracks: (start, end) => trackIndex().query(start, end),
      };
      recent.set(at, indexed);
      if (recent.size > MAX_ROWS) recent.delete(recent.keys().next().value!);
      return indexed;
    },
  };
  cache.set(rows, index);
  return index;
}

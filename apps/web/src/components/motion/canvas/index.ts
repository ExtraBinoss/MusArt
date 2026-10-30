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
const cache = new WeakMap<readonly TimelineRow[], readonly CanvasIndexedRow[]>();

/** Timeline rows are immutable presentation revisions; hover/viewport updates reuse their indexes. */
export function indexTimelineCanvas(rows: readonly TimelineRow[]): readonly CanvasIndexedRow[] {
  const existing = cache.get(rows);
  if (existing) return existing;
  const indexed = rows.map((row): CanvasIndexedRow => {
    const tracks = [...(row.occurrences ?? (row.track ? [row.track] : []))].sort(
      (a, b) => motionTimeToSeconds(a.start) - motionTimeToSeconds(b.start),
    );
    return {
      row,
      tracks,
      tracksById: new Map(tracks.map((track) => [track.id, track])),
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
        resolveLayerMotionProperty(row.layer, row.property.target)?.interpolation === "continuous",
      queryTracks: createTimelineIntervalIndex(tracks, (track) => ({
        start: motionTimeToSeconds(track.start),
        end: track.end ? motionTimeToSeconds(track.end) : Infinity,
      })),
    };
  });
  cache.set(rows, indexed);
  return indexed;
}

import { motionTimeToSeconds, type MotionKeyframe } from "@musart/core";
import type { TimelineRow } from "../tree";

interface Entry {
  row: number;
  propertyId: string;
  layerId: string;
  keys: readonly MotionKeyframe[];
}
export interface KeyRange extends Entry {
  first: number;
  after: number;
}
function keyBound(keys: readonly MotionKeyframe[], seconds: number, inclusive: boolean) {
  let low = 0,
    high = keys.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const value = motionTimeToSeconds(keys[middle]!.time);
    if (value < seconds || (inclusive && value === seconds)) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Hidden/collapsed property rows are absent. Each query visits only intersected rows. */
export function createTimelineSelectionIndex(rows: readonly TimelineRow[], rowHeight: number) {
  const entries: Entry[] = [];
  rows.forEach((row, index) => {
    if (row.kind === "property")
      entries.push({
        row: index,
        propertyId: row.property.id,
        layerId: row.layer.id,
        keys: row.property.keyframes,
      });
  });
  return {
    query(rect: { top: number; bottom: number; start: number; end: number }): KeyRange[] {
      const firstRow = Math.max(0, Math.floor(rect.top / rowHeight));
      const lastRow = Math.floor(rect.bottom / rowHeight);
      let low = 0,
        high = entries.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (entries[middle]!.row < firstRow) low = middle + 1;
        else high = middle;
      }
      const ranges: KeyRange[] = [];
      for (let index = low; index < entries.length; index++) {
        const entry = entries[index]!;
        if (entry.row > lastRow) break;
        const first = keyBound(entry.keys, rect.start, false);
        const after = keyBound(entry.keys, rect.end, true);
        if (first < after) ranges.push({ ...entry, first, after });
      }
      return ranges;
    },
  };
}

/** Large sets are materialized once at release, never on pointer movement. */
export function selectedRangeKeys(ranges: readonly KeyRange[], base: ReadonlySet<string>) {
  const keys = new Set(base);
  for (const range of ranges)
    for (let index = range.first; index < range.after; index++) keys.add(range.keys[index]!.id);
  return keys;
}

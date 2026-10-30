import { motionTimeToSeconds } from "@musart/core";
import type { CanvasIndexedKey, CanvasIndexedRow } from "./index";
import { timelineLowerBound } from "./intervals";
import type {
  TimelineCanvasEasing,
  TimelineCanvasKey,
  TimelineCanvasModel,
  TimelineCanvasViewport,
} from "./model";

interface Partition {
  selected: readonly CanvasIndexedKey[];
  other: readonly CanvasIndexedKey[];
}
const partitions = new WeakMap<
  readonly CanvasIndexedKey[],
  WeakMap<ReadonlySet<string>, Partition>
>();
function partition(keys: readonly CanvasIndexedKey[], selected: ReadonlySet<string>): Partition {
  let bySelection = partitions.get(keys);
  if (!bySelection) {
    bySelection = new WeakMap();
    partitions.set(keys, bySelection);
  }
  const existing = bySelection.get(selected);
  if (existing) return existing;
  const result = { selected: [] as CanvasIndexedKey[], other: [] as CanvasIndexedKey[] };
  for (const entry of keys) result[selected.has(entry.key.id) ? "selected" : "other"].push(entry);
  bySelection.set(selected, result);
  return result;
}

/** Dense keys cost viewport buckets, not total key count, once a revision/selection is indexed. */
export function projectCanvasKeys(
  indexed: CanvasIndexedRow,
  rowIndex: number,
  model: TimelineCanvasModel,
  viewport: TimelineCanvasViewport,
): (TimelineCanvasKey | TimelineCanvasEasing)[] {
  const { row, keys } = indexed;
  if (row.kind !== "property" || !row.track || !keys.length) return [];
  const draft = model.draft;
  const layerMoving =
    draft?.action === "move" &&
    (draft.trackIds
      ? draft.trackIds.has(row.track.id)
      : draft.trackId
        ? draft.trackId === row.track.id
        : draft.layerIds.has(row.layer.id));
  const keyMoving = draft?.action === "keys";
  const delta = draft ? motionTimeToSeconds(draft.delta) : 0;
  const selection = model.selectionPreview;
  const authored = partition(keys, selection?.base ?? model.selectedKeyIds);
  const ranges = selection?.ranges.filter((range) => range.propertyId === row.property.id) ?? [];
  const runs: { keys: readonly CanvasIndexedKey[]; offset: number; selected: boolean }[] = [];
  for (const [source, selected] of [
    [authored.selected, true],
    [authored.other, false],
  ] as const) {
    if (keyMoving) {
      const moved = partition(source, draft.keyIds);
      runs.push(
        { keys: moved.selected, offset: delta, selected },
        { keys: moved.other, offset: 0, selected },
      );
    } else runs.push({ keys: source, offset: layerMoving ? delta : 0, selected });
  }
  const y = rowIndex * model.rowHeight - viewport.top;
  const common = {
    rowKey: row.key,
    rowIndex,
    layerId: row.layer.id,
    trackId: row.track.id,
    propertyId: row.property.id,
  };
  const buckets = new Map<number, TimelineCanvasKey>();
  const firstPixel = Math.floor((viewport.left - 9) / 8) * 8;
  for (const run of runs) {
    if (!run.keys.length) continue;
    for (let pixel = firstPixel; pixel <= viewport.left + viewport.width + 9; pixel += 8) {
      const first = timelineLowerBound(
        run.keys,
        pixel / model.scale - run.offset,
        (entry) => entry.time,
      );
      const after = timelineLowerBound(
        run.keys,
        (pixel + 8) / model.scale - run.offset,
        (entry) => entry.time,
      );
      if (first === after) continue;
      const entry = run.keys[first]!,
        last = run.keys[after - 1]!;
      const x = (entry.time + run.offset) * model.scale - viewport.left;
      const existing = buckets.get(pixel);
      const bounds = { x: x - 9, y, width: 18, height: model.rowHeight };
      buckets.set(pixel, {
        kind: "key",
        bounds: existing?.bounds ?? bounds,
        selected:
          run.selected ||
          !!existing?.selected ||
          ranges.some((range) => range.first <= last.index && range.after > entry.index),
        count: after - first + (existing?.count ?? 0),
        hit: {
          ...common,
          kind: "key",
          keyId: existing?.hit.keyId ?? entry.key.id,
          bounds: existing?.bounds ?? bounds,
          firstKeyIndex: Math.min(existing?.hit.firstKeyIndex ?? Infinity, entry.index),
          afterKeyIndex: Math.max(existing?.hit.afterKeyIndex ?? -Infinity, last.index + 1),
        },
      });
    }
  }
  const segments: TimelineCanvasEasing[] = [];
  if (indexed.continuous) {
    const seen = new Set<string>();
    for (let pixel = viewport.left; pixel <= viewport.left + viewport.width + 8; pixel += 8) {
      const time = pixel / model.scale;
      let before: { entry: CanvasIndexedKey; time: number } | null = null;
      let next: { entry: CanvasIndexedKey; time: number } | null = null;
      // Merge only the neighboring keys of each sorted offset run; crossing keys need no full sort.
      for (const run of runs) {
        const at = timelineLowerBound(run.keys, time - run.offset, (entry) => entry.time);
        const left = run.keys[at - 1],
          right = run.keys[at];
        if (left) {
          const value = left.time + run.offset;
          if (
            !before ||
            value > before.time ||
            (value === before.time && left.index > before.entry.index)
          )
            before = { entry: left, time: value };
        }
        if (right) {
          const value = right.time + run.offset;
          if (!next || value < next.time || (value === next.time && right.index < next.entry.index))
            next = { entry: right, time: value };
        }
      }
      if (!before || !next || seen.has(next.entry.key.id)) continue;
      seen.add(next.entry.key.id);
      const start = before.time * model.scale - viewport.left;
      const end = next.time * model.scale - viewport.left;
      const x = Math.max(0, start),
        right = Math.min(viewport.width, end);
      if (right - x < 14) continue;
      const bounds = { x, y: y + 3, width: right - x, height: Math.max(2, model.rowHeight - 6) };
      segments.push({
        kind: "easing",
        bounds,
        easing: next.entry.key.easing,
        hit: {
          ...common,
          kind: "easing",
          keyId: next.entry.key.id,
          previousKeyId: before.entry.key.id,
          bounds: { ...bounds, x: x + (right - x - 14) / 2, width: 14 },
        },
      });
    }
  }
  return [...segments, ...buckets.values()];
}

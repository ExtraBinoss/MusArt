import { indexTimelineCanvas } from "./index";
import { projectCanvasAudio, projectCanvasClips } from "./clips";
import { projectCanvasKeys } from "./keys";
import type {
  TimelineCanvasHit,
  TimelineCanvasModel,
  TimelineCanvasRect,
  TimelineCanvasRow,
  TimelineCanvasScene,
  TimelineCanvasViewport,
} from "./model";

const rowIndexes = new WeakMap<TimelineCanvasModel["rows"], ReadonlyMap<string, number>>();
function indexesFor(rows: TimelineCanvasModel["rows"]) {
  let index = rowIndexes.get(rows);
  if (!index) {
    index = new Map(rows.map((row, at) => [row.key, at]));
    rowIndexes.set(rows, index);
  }
  return index;
}
function offsetRow(row: TimelineCanvasRow, y: number): TimelineCanvasRow {
  const delta = y - row.y;
  if (!delta) return row;
  const bounds = (rect: TimelineCanvasRect) => ({ ...rect, y: rect.y + delta });
  const hit = <T extends TimelineCanvasHit>(value: T): T => ({
    ...value,
    bounds: bounds(value.bounds),
  });
  return {
    ...row,
    y,
    gaps: row.gaps.map(hit),
    items: row.items.map((item) => {
      if (item.kind === "key") return { ...item, bounds: bounds(item.bounds), hit: hit(item.hit) };
      if (item.kind === "easing")
        return { ...item, bounds: bounds(item.bounds), hit: hit(item.hit) };
      return {
        ...item,
        bounds: bounds(item.bounds),
        hit: hit(item.hit),
        trims: item.trims.map(hit),
      };
    }),
  };
}

export function projectTimelineCanvas(
  model: TimelineCanvasModel,
  viewport: TimelineCanvasViewport,
): TimelineCanvasScene {
  if (
    ![
      model.scale,
      model.duration,
      model.rowHeight,
      viewport.left,
      viewport.top,
      viewport.width,
      viewport.height,
    ].every(Number.isFinite) ||
    model.scale <= 0 ||
    model.rowHeight <= 0 ||
    model.duration < 0 ||
    viewport.width < 0 ||
    viewport.height < 0
  )
    throw new RangeError("Invalid timeline canvas geometry.");
  const total = model.rows.length + model.audioTracks.length;
  const first = Math.max(0, Math.floor(viewport.top / model.rowHeight));
  const last = Math.min(total, Math.ceil((viewport.top + viewport.height) / model.rowHeight));
  const index = indexTimelineCanvas(model.rows);
  const rows: TimelineCanvasRow[] = [];
  const admitted = new Set<number>();
  for (let at = first; at < last; at++) admitted.add(at);
  if (model.rowPositions?.size) {
    const byKey = indexesFor(model.rows);
    for (const [key, pose] of model.rowPositions) {
      const at = byKey.get(key);
      if (
        at !== undefined &&
        pose.top + pose.height >= viewport.top &&
        pose.top < viewport.top + viewport.height
      )
        admitted.add(at);
    }
  }
  for (const at of admitted) {
    const indexed = index[at];
    if (indexed) {
      const { row } = indexed;
      const projected =
        row.kind === "layer" ? projectCanvasClips(indexed, at, model, viewport) : null;
      rows.push({
        key: row.key,
        index: at,
        y: at * model.rowHeight - viewport.top,
        selected: model.selectedLayerIds.has(row.layer.id),
        items: projected?.clips ?? projectCanvasKeys(indexed, at, model, viewport),
        gaps: projected?.gaps ?? [],
      });
    } else {
      const audio = model.audioTracks[at - model.rows.length]!;
      const clip = projectCanvasAudio(audio, at, model, viewport);
      rows.push({
        key: audio.id,
        index: at,
        y: at * model.rowHeight - viewport.top,
        selected: model.selectedAudioTrackIds?.has(audio.id) ?? false,
        items: clip ? [clip] : [],
        gaps: [],
      });
    }
  }
  if (model.rowPositions) {
    const poses = model.rowPositions;
    const positioned = rows
      .map((row) => {
        const pose = poses.get(row.key);
        return pose ? offsetRow(row, pose.top - viewport.top) : row;
      })
      .filter((row) => row.y + model.rowHeight >= 0 && row.y < viewport.height);
    positioned.sort(
      (a, b) =>
        (poses.get(a.key)?.zIndex ?? 0) - (poses.get(b.key)?.zIndex ?? 0) ||
        (poses.get(a.key)?.order ?? a.index) - (poses.get(b.key)?.order ?? b.index),
    );
    rows.splice(0, rows.length, ...positioned);
  }
  return {
    viewport,
    rowHeight: model.rowHeight,
    rows,
    hoverHit: model.hoverHit ?? null,
    easingDisabled:
      !!model.draft &&
      model.draft.delta.value !== 0 &&
      (model.draft.action === "keys" || model.draft.action === "move"),
  };
}

function inside(bounds: TimelineCanvasRect, x: number, y: number) {
  return (
    x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height
  );
}

/** Exact scene geometry also drives interaction; no parallel DOM-derived positions. */
export function hitTestTimelineCanvas(
  scene: TimelineCanvasScene,
  x: number,
  y: number,
): TimelineCanvasHit | null {
  if (
    ![x, y].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    x >= scene.viewport.width ||
    y >= scene.viewport.height
  )
    return null;
  let row: TimelineCanvasRow | undefined;
  for (let at = scene.rows.length - 1; at >= 0; at--) {
    const candidate = scene.rows[at]!;
    if (y >= candidate.y && y < candidate.y + scene.rowHeight) {
      row = candidate;
      break;
    }
  }
  if (!row) return null;
  for (const item of row.items) {
    if (item.kind !== "clip" && item.kind !== "audio") continue;
    let nearest: TimelineCanvasHit | null = null,
      distance = Infinity;
    for (const trim of item.trims) {
      if (!inside(trim.bounds, x, y)) continue;
      const start = trim.kind === "trimStart" || trim.kind === "audioTrimStart";
      const edge = start ? item.bounds.x : item.bounds.x + item.bounds.width;
      const next = Math.abs(x - edge);
      if (next < distance) {
        nearest = trim;
        distance = next;
      }
    }
    if (nearest) return nearest;
  }
  for (const kind of ["key", "easing", "clip", "audio"] as const)
    for (const item of row.items)
      if (
        item.kind === kind &&
        (kind !== "easing" || !scene.easingDisabled) &&
        inside(item.hit.bounds, x, y)
      )
        return item.hit;
  return row.gaps.find((gap) => inside(gap.bounds, x, y)) ?? null;
}

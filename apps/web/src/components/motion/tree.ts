import {
  motionTimeToSeconds,
  listLayerMotionOccurrences,
  type Composition,
  type Layer,
  type MotionKeyframe,
  type MotionLayerTrack,
  type MotionPropertyTrack,
} from "@musart/core";

export type TimelineRow = {
  key: string;
  layer: Layer;
  depth: number;
  track?: MotionLayerTrack;
  occurrences?: readonly MotionLayerTrack[];
} & (
  | { kind: "layer"; expandable: boolean; expanded: boolean }
  | { kind: "property"; property: MotionPropertyTrack }
);

/** Canonical foreground-first hierarchy, indexed once for each authored revision. */
export function projectTimelineRows(
  page: Composition,
  collapsed: ReadonlySet<string>,
  chosen?: ReadonlyMap<string, string>,
): TimelineRow[] {
  const children = new Map<string | null, Layer[]>();
  for (const layer of page.layers) {
    const siblings = children.get(layer.parentId) ?? [];
    siblings.push(layer);
    children.set(layer.parentId, siblings);
  }
  const pending = (children.get(null) ?? []).map((layer) => ({ layer, depth: 0 }));
  const rows: TimelineRow[] = [];
  while (pending.length) {
    const { layer, depth } = pending.pop()!;
    const occurrences = listLayerMotionOccurrences(page, layer.id);
    const track = occurrences.find((item) => item.id === chosen?.get(layer.id)) ?? occurrences[0];
    const expanded = !collapsed.has(layer.id);
    const expandable = !!children.get(layer.id)?.length || !!track?.properties.length;
    const common = { layer, depth, occurrences, ...(track ? { track } : {}) };
    rows.push({ ...common, kind: "layer", key: layer.id, expandable, expanded });
    if (!expanded) continue;
    for (const property of track?.properties ?? [])
      rows.push({
        ...common,
        kind: "property",
        key: property.id,
        depth: depth + 1,
        property,
      });
    for (const child of children.get(layer.id) ?? [])
      pending.push({ layer: child, depth: depth + 1 });
  }
  return rows;
}

function lowerBound(keys: readonly MotionKeyframe[], seconds: number): number {
  let low = 0,
    high = keys.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (motionTimeToSeconds(keys[middle]!.time) < seconds) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** One selectable marker per small pixel bucket bounds DOM work even for dense curves. */
export function projectKeyMarkers(
  keys: readonly MotionKeyframe[],
  left: number,
  width: number,
  pixelsPerSecond: number,
): {
  key: MotionKeyframe;
  count: number;
  x: number;
  firstKeyIndex: number;
  afterKeyIndex: number;
}[] {
  if (!keys.length || width <= 0 || pixelsPerSecond <= 0) return [];
  const bucket = 8;
  const start = Math.max(0, Math.floor(left / bucket) * bucket);
  const end = Math.min(start + width + bucket, left + width + bucket);
  const markers: {
    key: MotionKeyframe;
    count: number;
    x: number;
    firstKeyIndex: number;
    afterKeyIndex: number;
  }[] = [];
  for (let x = start; x <= end; x += bucket) {
    const first = lowerBound(keys, x / pixelsPerSecond);
    const after = lowerBound(keys, (x + bucket) / pixelsPerSecond);
    if (first < after)
      markers.push({
        key: keys[first]!,
        count: after - first,
        x: motionTimeToSeconds(keys[first]!.time) * pixelsPerSecond,
        firstKeyIndex: first,
        afterKeyIndex: after,
      });
  }
  return markers;
}

/** Only spans with a usable hit target are mounted; zoom reveals dense neighboring keys. */
export function projectEasingSegments(
  keys: readonly MotionKeyframe[],
  left: number,
  width: number,
  pixelsPerSecond: number,
) {
  const segments = new Map<
    string,
    { previous: MotionKeyframe; destination: MotionKeyframe; left: number; width: number }
  >();
  if (keys.length < 2 || width <= 0 || pixelsPerSecond <= 0) return [];
  for (let x = Math.max(0, left); x <= left + width + 8; x += 8) {
    const index = lowerBound(keys, x / pixelsPerSecond);
    if (index < 1 || index >= keys.length) continue;
    const previous = keys[index - 1]!,
      destination = keys[index]!;
    const start = motionTimeToSeconds(previous.time) * pixelsPerSecond;
    const end = motionTimeToSeconds(destination.time) * pixelsPerSecond;
    const clippedStart = Math.max(left, start),
      clippedEnd = Math.min(left + width, end);
    if (clippedEnd - clippedStart < 14) continue;
    segments.set(destination.id, {
      previous,
      destination,
      left: clippedStart,
      width: clippedEnd - clippedStart,
    });
  }
  return [...segments.values()];
}

import { motionTimeToSeconds, type MotionKeyframe } from "@musart/core";
import type { TimelineCanvasHost } from "./host";
import type { TimelineCanvasHit } from "./model";

const keyIndices = new WeakMap<readonly MotionKeyframe[], ReadonlyMap<string, number>>();
function indexFor(keys: readonly MotionKeyframe[], id: string) {
  let index = keyIndices.get(keys);
  if (!index) {
    index = new Map(keys.map((key, at) => [key.id, at]));
    keyIndices.set(keys, index);
  }
  return index.get(id) ?? -1;
}

/** Roving keyboard focus queries the full model without mounting an offscreen control tree. */
export function timelineKeyboardTarget(
  host: TimelineCanvasHost,
  current: TimelineCanvasHit | null,
  direction: "left" | "right" | "up" | "down",
) {
  const model = host.readModel();
  let rowIndex = current?.rowIndex ?? -1;
  let key: MotionKeyframe | undefined;
  if (current?.kind === "key" && model.rows[rowIndex]?.kind === "property") {
    const row = model.rows[rowIndex];
    if (row.kind === "property")
      key = row.property.keyframes[indexFor(row.property.keyframes, current.keyId)];
  }
  const seconds = key ? motionTimeToSeconds(key.time) : 0;
  if ((direction === "left" || direction === "right") && key) {
    const row = model.rows[rowIndex];
    if (row?.kind === "property") {
      const at = indexFor(row.property.keyframes, key.id);
      key =
        row.property.keyframes[
          Math.max(
            0,
            Math.min(row.property.keyframes.length - 1, at + (direction === "left" ? -1 : 1)),
          )
        ];
    }
  } else {
    const step = direction === "up" ? -1 : 1;
    if (rowIndex < 0) rowIndex = step > 0 ? -1 : model.rows.length;
    for (let index = rowIndex + step; index >= 0 && index < model.rows.length; index += step) {
      const row = model.rows[index];
      if (row.kind !== "property" || !row.property.keyframes.length) continue;
      let low = 0,
        high = row.property.keyframes.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (motionTimeToSeconds(row.property.keyframes[middle]!.time) < seconds) low = middle + 1;
        else high = middle;
      }
      key = row.property.keyframes[Math.min(low, row.property.keyframes.length - 1)];
      rowIndex = index;
      break;
    }
  }
  const row = model.rows[rowIndex],
    viewport = host.viewport.current;
  if (!key || !viewport || row?.kind !== "property" || !row.track) return null;
  const x = motionTimeToSeconds(key.time) * model.scale,
    y = rowIndex * model.rowHeight;
  const width = Math.max(1, viewport.clientWidth - model.gutter),
    height = Math.max(1, viewport.clientHeight - 32);
  if (x < viewport.scrollLeft + 12) viewport.scrollLeft = Math.max(0, x - 12);
  else if (x > viewport.scrollLeft + width - 12) viewport.scrollLeft = Math.max(0, x - width + 12);
  if (y < viewport.scrollTop) viewport.scrollTop = y;
  else if (y + model.rowHeight > viewport.scrollTop + height)
    viewport.scrollTop = y + model.rowHeight - height;
  host.invalidate();
  const index = indexFor(row.property.keyframes, key.id);
  return {
    kind: "key",
    rowKey: row.key,
    rowIndex,
    layerId: row.layer.id,
    trackId: row.track.id,
    propertyId: row.property.id,
    keyId: key.id,
    firstKeyIndex: index,
    afterKeyIndex: index + 1,
    bounds: {
      x: x - viewport.scrollLeft - 9,
      y: y - viewport.scrollTop,
      width: 18,
      height: model.rowHeight,
    },
  } satisfies TimelineCanvasHit;
}

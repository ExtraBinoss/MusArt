import type { Layer } from "@musart/core";
interface WindowEntry {
  key: string;
  kind: string;
  layer?: Layer;
}
export interface PositionedLayerEntry<T extends WindowEntry> {
  entry: T;
  at: number;
}
/** Keep native drag sources mounted and in their original DOM order while only visual positions move. */
export function layerDragWindow<T extends WindowEntry>(
  entries: readonly T[],
  canonical: readonly T[],
  first: number,
  last: number,
  dragging: string | null,
): PositionedLayerEntry<T>[] {
  const window = entries.slice(first, last).map((entry, index) => ({ entry, at: first + index }));
  if (!dragging) return window;
  const sourceAt = entries.findIndex(
    (entry) => entry.kind === "layer" && entry.layer?.id === dragging,
  );
  if (sourceAt >= 0 && (sourceAt < first || sourceAt >= last))
    window.push({ entry: entries[sourceAt]!, at: sourceAt });
  const order = new Map(canonical.map((entry, index) => [entry.key, index]));
  return window.sort(
    (left, right) =>
      (order.get(left.entry.key) ?? canonical.length + left.at) -
      (order.get(right.entry.key) ?? canonical.length + right.at),
  );
}

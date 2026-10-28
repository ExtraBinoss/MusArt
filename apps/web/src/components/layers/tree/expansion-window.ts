import type { PositionedLayerEntry } from "../drag/window";

interface Entry {
  key: string;
  kind: string;
}
/** Retain only bounded mounted exits, never the full collapsed hierarchy. */
export function expansionWindow<T extends Entry>(
  current: PositionedLayerEntry<T>[],
  previous: readonly PositionedLayerEntry<T>[],
  entries: readonly T[],
): PositionedLayerEntry<T>[] {
  const visible = new Set(current.map((item) => item.entry.key));
  const positions = new Map(entries.map((entry, at) => [entry.key, at]));
  const exits = previous.filter((item) => !visible.has(item.entry.key)).slice(0, 64);
  return [
    ...current,
    ...exits.map((item) => ({ ...item, at: positions.get(item.entry.key) ?? item.at })),
  ].sort(
    (left, right) =>
      left.at - right.at ||
      Number(visible.has(left.entry.key)) - Number(visible.has(right.entry.key)),
  );
}

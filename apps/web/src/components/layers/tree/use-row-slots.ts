import { useState } from "react";
import type { PositionedLayerEntry } from "../drag/window";

interface Entry {
  key: string;
  kind: string;
}
interface Slotted<T extends Entry> extends PositionedLayerEntry<T> {
  slot: number;
}

/** Reuse a bounded row shell; a held native drag only allocates genuinely new DOM keys. */
export function rowSlots<T extends Entry>(
  rows: readonly PositionedLayerEntry<T>[],
  previous: readonly Slotted<T>[],
  dragging: boolean,
): Slotted<T>[] {
  const old = new Map(previous.map((row) => [row.entry.key, row.slot]));
  const used = new Set(
    rows.flatMap(({ entry }) => (old.has(entry.key) ? [old.get(entry.key)!] : [])),
  );
  let next = dragging ? Math.max(-1, ...previous.map((row) => row.slot)) + 1 : 0;
  return rows.map((row) => {
    let slot = old.get(row.entry.key);
    if (slot === undefined) {
      while (used.has(next)) next++;
      slot = next++;
      used.add(slot);
    }
    return { ...row, slot };
  });
}

export function useRowSlots<T extends Entry>(
  rows: readonly PositionedLayerEntry<T>[],
  dragging: boolean,
) {
  const [snapshot, setSnapshot] = useState(() => ({
    rows,
    dragging,
    slots: rowSlots(rows, [], dragging),
  }));
  if (snapshot.rows !== rows || snapshot.dragging !== dragging) {
    const slots = rowSlots(rows, snapshot.slots, dragging);
    // React owns this derived snapshot, so abandoned renders cannot donate assignments.
    setSnapshot({ rows, dragging, slots });
    return slots;
  }
  return snapshot.slots;
}

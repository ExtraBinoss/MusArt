import { expect, it, vi } from "vitest";
import { indexTimelineCanvas } from "../../../../src/components/motion/canvas/index";
import { canvasFixture } from "./support";

it("reuses immutable row revisions and rebuilds indexes for a replaced revision", () => {
  const d = canvasFixture();
  const first = indexTimelineCanvas(d.rows);
  expect(indexTimelineCanvas(d.rows)).toBe(first);
  expect(
    first
      .get(0)
      ?.queryTracks(1.5, 2.1)
      .map((track) => track.id),
  ).toEqual(["second"]);
  expect(first.get(1)?.continuous).toBe(true);
  expect(first.get(1)?.keys.map((entry) => entry.key.id)).toEqual(["a", "b"]);
  const rows = d.rows.map((row) => ({ ...row, occurrences: [d.tracks[1]!] }));
  expect(indexTimelineCanvas(rows)).not.toBe(first);
  expect(indexTimelineCanvas(rows).get(0)?.queryTracks(0, 0.5)).toEqual([]);
  expect(first.get(0)?.queryTracks(0, 0.5)).toHaveLength(1);
});

it("indexes only consulted rows, retaining a bounded recent working set", () => {
  const d = canvasFixture();
  const property = d.rows[1]!;
  if (property.kind !== "property") throw Error("Missing property fixture");
  const read = vi.fn(() => property.property.keyframes);
  const deferred = {
    ...property,
    property: {
      ...property.property,
      get keyframes() {
        return read();
      },
    },
  };
  const rows = [
    d.rows[0]!,
    deferred,
    ...Array.from({ length: 64 }, (_, i) => ({ ...d.rows[0]!, key: `row-${i}` })),
  ];
  const index = indexTimelineCanvas(rows);
  expect(read).not.toHaveBeenCalled();
  const first = index.get(0);
  expect(read).not.toHaveBeenCalled();
  expect(index.get(0)).toBe(first);
  const visible = index.get(1);
  expect(visible?.keys).toHaveLength(2);
  expect(read).toHaveBeenCalledOnce();
  for (let i = 2; i < rows.length; i++) index.get(i);
  expect(index.get(0)).not.toBe(first);
  expect(index.get(rows.length)).toBeUndefined();
});

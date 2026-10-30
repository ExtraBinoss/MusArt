import { expect, it } from "vitest";
import { indexTimelineCanvas } from "../../../../src/components/motion/canvas/index";
import { canvasFixture } from "./support";

it("reuses immutable row revisions and rebuilds indexes for a replaced revision", () => {
  const d = canvasFixture();
  const first = indexTimelineCanvas(d.rows);
  expect(indexTimelineCanvas(d.rows)).toBe(first);
  expect(first[0]?.queryTracks(1.5, 2.1).map((track) => track.id)).toEqual(["second"]);
  expect(first[1]?.continuous).toBe(true);
  expect(first[1]?.keys.map((entry) => entry.key.id)).toEqual(["a", "b"]);
  const rows = d.rows.map((row) => ({ ...row, occurrences: [d.tracks[1]!] }));
  expect(indexTimelineCanvas(rows)).not.toBe(first);
  expect(indexTimelineCanvas(rows)[0]?.queryTracks(0, 0.5)).toEqual([]);
  expect(first[0]?.queryTracks(0, 0.5)).toHaveLength(1);
});

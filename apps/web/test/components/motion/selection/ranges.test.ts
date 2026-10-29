import { expect, it } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { projectTimelineRows } from "../../../../src/components/motion/tree";
import {
  createTimelineSelectionIndex,
  selectedRangeKeys,
} from "../../../../src/components/motion/selection/ranges";

it("queries actual expanded property rows and inclusive time bounds without scanning other keys", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [createLayer("rectangle", { id: "a" }), createLayer("rectangle", { id: "b" })],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const layerId of ["a", "b"])
    for (const value of [0, 1, 2])
      engine.execute({
        type: "upsertMotionKeyframe",
        target: { kind: "layer", layerId, property: "x" },
        time: { value, rate: 1 },
        value,
      });
  const page = engine.getSnapshot().project.pages[0]!;
  const rows = projectTimelineRows(page, new Set());
  const index = createTimelineSelectionIndex(rows, 24);
  const ranges = index.query({ top: 24, bottom: 47, start: 1, end: 2 });
  expect(ranges).toHaveLength(1);
  expect(ranges[0]).toMatchObject({ row: 1, layerId: "b", first: 1, after: 3 });
  const keys = selectedRangeKeys(ranges, new Set(["already-selected"]));
  expect([...keys]).toEqual(["already-selected", ...ranges[0]!.keys.slice(1).map((key) => key.id)]);
  expect(index.query({ top: 0, bottom: 23, start: 0, end: 2 })).toEqual([]);
  const collapsed = createTimelineSelectionIndex(
    projectTimelineRows(page, new Set(["a", "b"])),
    24,
  );
  expect(collapsed.query({ top: 0, bottom: 1000, start: 0, end: 2 })).toEqual([]);
});

import { expect, it } from "vitest";
import {
  applyMotionFrame,
  compileMotion,
  EditorEngine,
  evaluateMotion,
  TRANSITION_CATALOG,
} from "@musart/core";
import { createTransitionAtlas } from "../../../../../src/services/projects/templates/designed/atlas";

it("demonstrates all thirty styles on independent occurrences of one canonical group", () => {
  const { initial, project, batches } = createTransitionAtlas();
  const replay = new EditorEngine(initial, { now: () => project.updatedAt });
  for (const batch of batches) replay.transaction([...batch]);
  expect(replay.getSnapshot().project).toEqual(project);
  const page = project.pages[0]!,
    clips = page.motion!.tracks.filter(({ layerId }) => layerId === "atlas-stage");
  expect(page.motion!.version).toBe(2);
  expect(clips).toHaveLength(30);
  expect(page.layers.filter(({ id }) => id === "atlas-stage")).toHaveLength(1);
  expect(page.layers.filter(({ parentId }) => parentId === "atlas-stage")).toHaveLength(4);
  expect(page.layers.find(({ id }) => id === "atlas-stage")!.effects).toHaveLength(1);
  expect(
    new Set(
      clips.flatMap(({ properties }) =>
        properties.flatMap(({ keyframes }) => keyframes.map(({ id }) => id)),
      ),
    ).size,
  ).toBe(150);
  const program = compileMotion(project, { compositionId: page.id });
  for (const index of [29, 0, 15, 0, 29]) {
    const frame = evaluateMotion(program, { value: index * 2 + 1, rate: 1 });
    const group = applyMotionFrame(program, frame).layers.find(({ id }) => id === "atlas-stage")!;
    expect(group.effects[0]!.settings).toMatchObject({
      style: TRANSITION_CATALOG[index]!.id,
      progress: 1,
    });
    expect(frame.activeLayerIds.filter((id) => id === "atlas-stage")).toHaveLength(1);
  }
});

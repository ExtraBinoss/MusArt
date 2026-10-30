import { expect, test } from "vitest";
import { EditorEngine, parseProject, serializeProject } from "@musart/core";
import { createMorphingType } from "../../../../../src/services/projects/templates/motion/morphing-type";
import { parseMotionTemplateManifest } from "../../../../../src/services/projects/templates/motion/loader";
test("replays the reference as one editable object and one native animation, without video originals", () => {
  const built = createMorphingType();
  const replay = new EditorEngine(built.initial, { now: () => built.initial.createdAt });
  for (const batch of built.batches) replay.transaction([...batch]);
  expect(replay.getSnapshot().project).toEqual(built.project);
  const page = built.project.pages[0]!;
  expect([page.width, page.height]).toEqual([790, 480]);
  expect(page.layers).toHaveLength(1);
  expect(page.layers[0]).toMatchObject({ kind: "text", text: "MORPH" });
  expect(
    page.layers[0]!.effects[0]!.shapeMorph!.shapes.every((shape) => shape.frames.length === 67),
  ).toBe(true);
  expect(page.motion!.tracks.flatMap((track) => track.animations ?? [])).toHaveLength(1);
  expect(page.motion!.duration).toEqual({ value: 67, rate: 30 });
  expect(parseProject(serializeProject(built.project))).toEqual(built.project);
  expect(
    parseMotionTemplateManifest(
      { version: 1, templateId: "morphing-type", project: built.project, originals: [] },
      "morphing-type",
    ).originals,
  ).toEqual([]);
});

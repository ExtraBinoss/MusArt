import { expect, test } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { hasMotionKeys, motionPropertyTrack } from "../../../src/state/motion/keyframes";
const x = { kind: "layer", layerId: "hero", property: "x" } as const;
test("indexes channels by occurrence and never borrows another clip's keys", () => {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [createLayer("rectangle", { id: "hero" })] })] }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({
    type: "upsertMotionKeyframe",
    target: x,
    time: { value: 0, rate: 1 },
    value: 10,
  });
  const original = engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
  engine.execute({
    type: "duplicateMotionOccurrence",
    trackId: original.id,
    start: { value: 3, rate: 1 },
  });
  const copy = engine.getSnapshot().project.pages[0]!.motion!.tracks[1]!;
  engine.execute({
    type: "upsertMotionKeyframe",
    trackId: copy.id,
    target: x,
    time: { value: 3, rate: 1 },
    value: 20,
  });
  const page = engine.getSnapshot().project.pages[0]!;
  expect(motionPropertyTrack(page, x)).toBeUndefined();
  expect(motionPropertyTrack(page, x, { time: { value: 0, rate: 1 } })!.keyframes[0]!.value).toBe(
    10,
  );
  expect(motionPropertyTrack(page, x, { time: { value: 3, rate: 1 } })!.keyframes[0]!.value).toBe(
    20,
  );
  expect(hasMotionKeys(page, x, { time: { value: 5, rate: 2 } })).toBe(false);
  expect(motionPropertyTrack(page, x, { trackId: original.id })).toBe(
    page.motion!.tracks[0]!.properties[0],
  );
  const mutable = structuredClone(page);
  expect(motionPropertyTrack(mutable, x, { trackId: copy.id })!.keyframes[0]!.value).toBe(20);
  mutable.motion!.tracks[1]!.properties = [];
  expect(motionPropertyTrack(mutable, x, { trackId: copy.id })).toBeUndefined();
});

import { expect, test } from "vitest";
import {
  applyMotionFrame,
  compileMotion,
  EditorEngine,
  evaluateMotion,
  serializeProject,
  validateProject,
} from "@musart/core";
import { createBloomTemplate } from "../../../../../src/services/projects/templates/motion/showcase";
import { templateMedia } from "../../../../support/motion-template-media";

test("builds a real editable deterministic photo/video collage using only public headless commands", () => {
  const media = templateMedia();
  const result = createBloomTemplate(media);
  validateProject(result.project);
  expect(serializeProject(createBloomTemplate(media).project)).toBe(
    serializeProject(result.project),
  );
  const replay = new EditorEngine(result.initial, { now: () => result.initial.createdAt });
  for (const batch of result.batches) replay.transaction([...batch]);
  expect(replay.getSnapshot().project).toEqual(result.project);
  const page = result.project.pages[0]!;
  expect(page.layers.filter((layer) => layer.kind === "group")).toHaveLength(3);
  expect(page.layers.filter((layer) => layer.kind === "image")).toHaveLength(2);
  expect(page.layers.filter((layer) => layer.kind === "video")).toHaveLength(1);
  expect(page.layers.find((layer) => layer.id === "bloom-video")!.mask).toMatchObject({
    layerId: "bloom-mask",
    mode: "alpha",
  });
  expect(page.motion).toMatchObject({ mode: "motion", duration: { value: 5000, rate: 1000 } });
  expect(page.motion!.tracks.find((track) => track.layerId === "bloom-video")).toMatchObject({
    start: { value: 0, rate: 1000 },
    end: { value: 5000, rate: 1000 },
    media: { mute: false, volume: 0.65 },
  });
  const program = compileMotion(result.project, { compositionId: page.id });
  const frameAt = (value: number) =>
    applyMotionFrame(program, evaluateMotion(program, { value, rate: 1000 }));
  expect(frameAt(500)).toEqual(frameAt(500));
  expect(frameAt(500).layers.find((layer) => layer.id === "bloom-title")!.opacity).toBe(1);
  expect(frameAt(3000).layers.find((layer) => layer.id === "bloom-hand-label")!.text).toBe(
    "KEEP EXPLORING",
  );
  expect(frameAt(1000)).not.toEqual(frameAt(4000));
  // Random seek order must not affect the same timestamp or mutate its canonical base design.
  const middle = frameAt(2500);
  frameAt(4500);
  frameAt(0);
  expect(frameAt(2500)).toEqual(middle);
  expect(page.layers.find((layer) => layer.id === "bloom-title")!.opacity).toBe(1);
  expect(result.initial.pages[0]!.layers).toHaveLength(0);
});

test("rejects missing real source material instead of silently substituting a fake preview", () => {
  expect(() => createBloomTemplate({ ...templateMedia(), photos: [] })).toThrow(
    "two original photographs",
  );
});

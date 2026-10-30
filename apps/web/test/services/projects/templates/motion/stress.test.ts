import { expect, test } from "vitest";
import {
  compileMotion,
  isImageAsset,
  EFFECT_CATALOG,
  evaluateMotion,
  motionTimeToSeconds,
  serializeProject,
  validateProject,
} from "@musart/core";
import { createStressTemplate } from "../../../../../src/services/projects/templates/motion/stress";
import { templateMedia } from "../../../../support/motion-template-media";

test("creates the declared 50-photo/100-effect mixed-media workload, with bounded isolated rows and shared originals", () => {
  const result = createStressTemplate(templateMedia());
  validateProject(result.project);
  const page = result.project.pages[0]!;
  expect(page.layers.filter((layer) => layer.kind === "image")).toHaveLength(50);
  for (const layer of page.layers.filter((item) => item.kind === "image")) {
    const asset = result.project.assets[layer.assetId!]!;
    if (!isImageAsset(asset)) throw new Error("Expected an image template asset");
    expect(layer.width / layer.height).toBeCloseTo(asset.width / asset.height, 8);
  }
  const effects = page.layers.flatMap((layer) => layer.effects);
  expect(effects).toHaveLength(100);
  expect(new Set(effects.map((effect) => effect.type))).toEqual(
    new Set(
      Object.values(EFFECT_CATALOG)
        .filter((effect) => !effect.source)
        .map((effect) => effect.type),
    ),
  );
  expect(page.layers.filter((layer) => layer.kind === "group")).toHaveLength(5);
  expect(
    page.layers.filter((layer) => layer.kind === "group").every((layer) => layer.height === 117),
  ).toBe(true);
  const videos = page.layers.filter((layer) => layer.kind === "video");
  expect(videos).toHaveLength(3);
  expect(new Set(videos.map((layer) => layer.assetId)).size).toBe(1);
  expect(Object.keys(result.project.assets)).toHaveLength(4);
  const clips = page.motion!.tracks.filter((track) =>
    videos.some((layer) => layer.id === track.layerId),
  );
  expect(clips.filter((track) => !track.media!.mute)).toHaveLength(1);
  expect(clips[1]!.media!.sourceIn).toEqual({ value: 200, rate: 1000 });
  for (const clip of clips)
    expect(
      motionTimeToSeconds(clip.media!.sourceIn) +
        motionTimeToSeconds(clip.end!) -
        motionTimeToSeconds(clip.start),
    ).toBeLessThanOrEqual(5.005);
  const properties = page.motion!.tracks.flatMap((track) => track.properties);
  const easingKinds = new Set(
    properties.flatMap((track) => track.keyframes.map((key) => key.easing?.type)),
  );
  expect(easingKinds).toEqual(new Set([undefined, "linear", "hold", "cubicBezier", "spring"]));
  expect(
    properties.filter(
      (track) => track.target.kind === "effect" && track.target.property === "amount",
    ),
  ).toHaveLength(100);
  expect(result.batches.every((batch) => batch.length <= 1000)).toBe(true);
  const program = compileMotion(result.project, { compositionId: page.id }),
    time = { value: 73, rate: 30 };
  const sample = evaluateMotion(program, time);
  evaluateMotion(program, { value: 4, rate: 1 });
  evaluateMotion(program, { value: 0, rate: 1 });
  expect(evaluateMotion(program, time)).toEqual(sample);
  expect(serializeProject(createStressTemplate(templateMedia()).project)).toBe(
    serializeProject(result.project),
  );
});

test("requires the declared stock-photo sources", () => {
  expect(() => createStressTemplate({ ...templateMedia(), photos: [] })).toThrow(
    "three original photographs",
  );
});

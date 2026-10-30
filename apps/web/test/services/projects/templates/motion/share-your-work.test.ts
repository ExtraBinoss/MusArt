import { expect, test } from "vitest";
import {
  applyMotionFrame,
  compileMotion,
  EditorEngine,
  evaluateMotion,
  type ImageAsset,
} from "@musart/core";
import { createShareYourWork } from "../../../../../src/services/projects/templates/motion/share-your-work";
import { parseMotionTemplateManifest } from "../../../../../src/services/projects/templates/motion/loader";

test("recreates the reference cadence with editable action blocks and deterministic public command replay", () => {
  const photos: ImageAsset[] = Array.from({ length: 8 }, (_, index) => ({
    id: `photo-${index}`,
    name: `Photo ${index}`,
    mime: "image/png",
    width: 1,
    height: 1,
    dataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  }));
  const result = createShareYourWork(photos);
  const replay = new EditorEngine(result.initial, { now: () => result.initial.createdAt });
  for (const batch of result.batches) replay.transaction([...batch]);
  expect(replay.getSnapshot().project).toEqual(result.project);
  const page = result.project.pages[0]!;
  expect(page.width).toBe(480);
  expect(page.height).toBe(480);
  expect(page.motion!.tracks.flatMap((track) => track.animations ?? [])).toHaveLength(11);
  expect(page.layers.filter((layer) => layer.kind === "image")).toHaveLength(8);
  const order = page.layers.map((layer) => layer.id);
  expect(order.indexOf("share-work")).toBeLessThan(order.indexOf("share-card-4"));
  expect(order.indexOf("share-card-4")).toBeLessThan(order.indexOf("share-your"));
  expect(order.indexOf("share-your")).toBeLessThan(order.indexOf("share-card-1"));
  expect(order.indexOf("share-card-1")).toBeLessThan(order.indexOf("share-title"));
  expect(order.indexOf("share-title")).toBeLessThan(order.indexOf("share-card-8"));
  expect(page.layers.find((layer) => layer.id === "share-card-8")).toMatchObject({
    x: 63,
    y: 89,
    width: 170,
  });
  for (const layer of page.layers.filter((layer) => layer.kind === "image"))
    expect(layer.effects.find((effect) => effect.type === "shadow")).toMatchObject({
      amount: 0.65,
      settings: { radius: 12, offsetY: 10 },
    });
  const program = compileMotion(result.project, { compositionId: page.id });
  const sample = (milliseconds: number) =>
    applyMotionFrame(program, evaluateMotion(program, { value: milliseconds, rate: 1000 }));
  expect(sample(149).layers.find((layer) => layer.id === "share-card-1")!.visible).toBe(true);
  expect(sample(151).layers.find((layer) => layer.id === "share-card-1")!.visible).toBe(false);
  expect(sample(901).layers.find((layer) => layer.id === "share-card-1")!.visible).toBe(true);
  const midway = sample(200).layers.find((layer) => layer.id === "share-card-4")!;
  expect(midway.scaleX).toBeGreaterThan(0.05);
  expect(midway.scaleX).toBeLessThan(1);
  expect(midway.effects.find((effect) => effect.type === "blur")!.amount).toBeGreaterThan(0);
  expect(midway.effects.find((effect) => effect.type === "blur")!.amount).toBeLessThan(1);
  expect(
    sample(250)
      .layers.find((layer) => layer.id === "share-card-4")!
      .effects.find((effect) => effect.type === "blur")!.amount,
  ).toBeGreaterThan(0.4);
  expect(
    parseMotionTemplateManifest(
      { version: 1, templateId: "share-your-work", project: result.project, originals: [] },
      "share-your-work",
    ).originals,
  ).toEqual([]);
});

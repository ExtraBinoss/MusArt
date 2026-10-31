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
  expect(page.motion!.tracks.flatMap((track) => track.animations ?? [])).toHaveLength(10);
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
  const startFrame = sample(0);
  const endFrame = applyMotionFrame(
    program,
    evaluateMotion(program, { value: 1200, rate: 1000 }, { terminalPreview: true }),
  );
  const visible = (frame: typeof startFrame) =>
    frame.layers
      .filter((l) => l.visible && l.opacity > 1e-6)
      .map((l) => ({
        id: l.id,
        x: l.x,
        y: l.y,
        rotation: l.rotation,
        opacity: l.opacity,
        scaleX: l.scaleX,
        scaleY: l.scaleY,
        effects: l.effects,
      }));
  const first = visible(startFrame),
    last = visible(endFrame);
  expect(last.map((l) => l.id)).toEqual(first.map((l) => l.id));
  for (let i = 0; i < first.length; i++) {
    expect(last[i]!.scaleX ?? 1).toBeCloseTo(first[i]!.scaleX ?? 1, 8);
    expect(last[i]!.opacity).toBeCloseTo(first[i]!.opacity, 8);
    expect(last[i]!.x).toBe(first[i]!.x);
  }
  expect(
    sample(200)
      .layers.filter((l) => l.visible && l.opacity > 0)
      .map((l) => l.id),
  ).not.toEqual(first.map((l) => l.id));
  expect(page.layers.filter((l) => l.kind === "text").map((l) => l.text)).toContain("HAUNT");
  expect(JSON.stringify(result.project)).not.toContain("SHARE YOUR WORK");
  expect(
    parseMotionTemplateManifest(
      { version: 1, templateId: "share-your-work", project: result.project, originals: [] },
      "share-your-work",
    ).originals,
  ).toEqual([]);
});

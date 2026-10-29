import { expect, it } from "vitest";
import { EditorEngine } from "../../src/session/engine";
import { createLayer, createEffect, createPage, createProject } from "../../src/document/factories";

function setup() {
  const effect = createEffect("brightness", { id: "brightness" });
  const layer = createLayer("rectangle", { id: "item", effects: [effect] });
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] }));
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.transaction([
    {
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "item", property: "x" },
      time: { value: 0, rate: 1 },
      value: 50,
    },
    {
      type: "upsertMotionKeyframe",
      target: { kind: "effect", layerId: "item", effectId: "brightness", property: "amount" },
      time: { value: 1, rate: 1 },
      value: 0.5,
    },
  ]);
  return engine;
}

it("duplicates timing and keys with new graph identities and the actual spatial offset", () => {
  const engine = setup();
  const before = engine.getSnapshot();
  engine.execute({ type: "duplicateLayers", ids: ["item"] });
  const page = engine.getSnapshot().project.pages[0]!;
  const [original, duplicate] = page.motion!.tracks;
  expect(duplicate!.id).not.toBe(original!.id);
  expect(duplicate!.start).toEqual(original!.start);
  expect(duplicate!.properties[0]!.keyframes[0]!.value).toBe(74);
  expect(original!.properties[0]!.keyframes[0]!.value).toBe(50);
  const effectTarget = duplicate!.properties[1]!.target;
  expect(effectTarget).toMatchObject({
    layerId: page.layers[1]!.id,
    effectId: page.layers[1]!.effects[0]!.id,
  });
  expect(duplicate!.properties[0]!.keyframes[0]!.id).not.toBe(
    original!.properties[0]!.keyframes[0]!.id,
  );
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before.project);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.motion!.tracks).toHaveLength(2);
});

it("removes only deleted effect targets without mutating previously published motion", () => {
  const engine = setup();
  const before = engine.getSnapshot();
  engine.execute({ type: "updateLayers", ids: ["item"], patch: { effects: [] } });
  const properties = engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.properties;
  expect(properties).toHaveLength(1);
  expect(properties[0]!.target.kind).toBe("layer");
  expect(before.project.pages[0]!.motion!.tracks[0]!.properties).toHaveLength(2);
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before.project);
});

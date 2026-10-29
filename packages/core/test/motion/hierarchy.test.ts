import { expect, it } from "vitest";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { EditorEngine } from "../../src/session/engine";

it("rejects hierarchy rewrites that would discard or reinterpret animated local transforms", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("group", { id: "group" }),
            createLayer("rectangle", { id: "child", parentId: "group" }),
            createLayer("rectangle", { id: "other" }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: "child", property: "x" },
    time: { value: 1, rate: 1 },
    value: 100,
  });
  const before = engine.getSnapshot();
  expect(() => engine.execute({ type: "ungroupLayers", ids: ["group"] })).toThrow("baking");
  expect(() => engine.execute({ type: "groupLayers", ids: ["child", "other"] })).toThrow("baking");
  expect(() =>
    engine.execute({ type: "reorderLayer", id: "child", index: 1, parentId: null }),
  ).toThrow("baking");
  expect(engine.getSnapshot()).toBe(before);
  // Stacking order in the same coordinate system is still available.
  engine.execute({ type: "reorderLayer", id: "child", index: 2 });
  expect(
    engine.getSnapshot().project.pages[0]!.motion!.tracks[1]!.properties[0]!.keyframes[0]!.value,
  ).toBe(100);
});

it("keeps ordinary hierarchy operations available on an unanimated Motion design", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("rectangle", { id: "one" }),
            createLayer("rectangle", { id: "two" }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({ type: "groupLayers", ids: ["one", "two"] });
  const groupId = engine.getSnapshot().selection[0]!;
  engine.execute({ type: "ungroupLayers", ids: [groupId] });
  expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(2);
});

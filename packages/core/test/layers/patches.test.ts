import { expect, test } from "vitest";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { EditorEngine } from "../../src/session/engine";
import { applyLayerPatches } from "../../src/layers/patches";
test("commits ten thousand distinct patches in one undoable command and keeps selection valid", () => {
  const layers = Array.from({ length: 10000 }, (_, i) =>
    createLayer("rectangle", { id: `r${i}`, x: i, y: 0, width: 1, height: 1 }),
  );
  const engine = new EditorEngine(createProject({ pages: [createPage({ width: 10000, layers })] }));
  const ids = layers.map((layer) => layer.id);
  engine.select(ids);
  expect(engine.getSnapshot().selection).toHaveLength(10000);
  engine.execute({
    type: "updateLayerPatches",
    patches: layers.map((layer) => ({ id: layer.id, patch: { x: layer.x + 7, y: 11 } })),
  });
  expect(engine.getSnapshot().project.pages[0]!.layers[9999]).toMatchObject({ x: 10006, y: 11 });
  expect(engine.getSnapshot().selection).toHaveLength(10000);
  engine.undo();
  expect(engine.getSnapshot().project.pages[0]!.layers[9999]!.x).toBe(9999);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.layers[9999]!.y).toBe(11);
});
test("validates all target and lock preconditions before changing any layer", () => {
  const parent = createLayer("group", { id: "g", locked: true }),
    child = createLayer("rectangle", { id: "c", parentId: "g" }),
    free = createLayer("rectangle", { id: "f" });
  const page = createPage({ layers: [parent, child, free] });
  const before = structuredClone(page);
  expect(() =>
    applyLayerPatches(page, [
      { id: "f", patch: { x: 100 } },
      { id: "c", patch: { x: 200 } },
    ]),
  ).toThrow("verrouillé");
  expect(page).toEqual(before);
  expect(() => applyLayerPatches(page, [{ id: "f", patch: { id: "changed" } }])).toThrow(
    "immuables",
  );
  expect(() => applyLayerPatches(page, [{ id: "missing", patch: { x: 1 } }])).toThrow("missing");
  expect(() =>
    applyLayerPatches(page, [
      { id: "f", patch: {} },
      { id: "f", patch: {} },
    ]),
  ).toThrow("Duplicate");
  expect(() => applyLayerPatches(page, {} as never)).toThrow("batch");
  applyLayerPatches(page, [{ id: "g", patch: { locked: false } }]);
  applyLayerPatches(page, [
    { id: "c", patch: { visible: false } },
    { id: "f", patch: { x: 100 } },
  ]);
  expect(page.layers[1]!.visible).toBe(false);
  expect(page.layers[2]!.x).toBe(100);
});
test("rolls invalid values back atomically and releases unused mask sources once", () => {
  const page = createPage({
    layers: [
      createLayer("rectangle", { id: "a", mask: { layerId: "m", enabled: true, inverted: false } }),
      createLayer("rectangle", { id: "m", maskSource: true }),
    ],
  });
  const engine = new EditorEngine(createProject({ pages: [page] }));
  const initial = engine.getSnapshot();
  expect(() =>
    engine.execute({ type: "updateLayerPatches", patches: [{ id: "a", patch: { width: -1 } }] }),
  ).toThrow();
  expect(engine.getSnapshot()).toBe(initial);
  engine.execute({ type: "updateLayerPatches", patches: [{ id: "a", patch: { mask: null } }] });
  expect(engine.getSnapshot().project.pages[0]!.layers[1]!.maskSource).toBe(false);
});

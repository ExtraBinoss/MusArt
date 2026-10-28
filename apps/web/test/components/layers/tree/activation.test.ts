import { expect, test } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { activateLayerPage } from "../../../../src/components/layers/tree/activation";
test("activates the real artboard without a document transaction and rejects stale snapshots", () => {
  const engine = new EditorEngine(
      createProject({ pages: [createPage({ layers: [createLayer("rectangle")] }), createPage()] }),
    ),
    snapshot = engine.getSnapshot(),
    page = snapshot.project.pages[1]!;
  engine.select([snapshot.project.pages[0]!.layers[0]!.id]);
  expect(activateLayerPage(engine, page)).toBe(true);
  expect(engine.getSnapshot()).toMatchObject({ pageId: page.id, selection: [], canUndo: false });
  const active = engine.getSnapshot();
  expect(activateLayerPage(engine, page)).toBe(true);
  expect(engine.getSnapshot()).toBe(active);
  engine.load(structuredClone(active.project));
  const replacement = engine.getSnapshot();
  expect(activateLayerPage(engine, page)).toBe(false);
  expect(engine.getSnapshot()).toBe(replacement);
});
test("rejects a reentrant replacement with the same page ID before a caller can select its source", () => {
  const engine = new EditorEngine(createProject({ pages: [createPage(), createPage()] })),
    original = engine.getSnapshot().project,
    target = original.pages[1]!,
    replacement = structuredClone(original);
  replacement.id = "replacement-project";
  let loaded = false;
  const stop = engine.subscribe(() => {
    if (!loaded && engine.getSnapshot().pageId === target.id) {
      loaded = true;
      engine.load(replacement);
      engine.setPage(target.id);
    }
  });
  expect(activateLayerPage(engine, target)).toBe(false);
  expect(engine.getSnapshot()).toMatchObject({
    pageId: target.id,
    project: { id: replacement.id },
    selection: [],
  });
  stop();
});

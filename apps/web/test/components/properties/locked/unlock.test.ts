import { expect, test } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { blockingLocks, captureUnlock } from "../../../../src/components/properties/locked/unlock";

function fixture() {
  const page = createPage({
    id: "page",
    layers: [
      createLayer("group", { id: "outer", name: "Outer", locked: true }),
      createLayer("group", { id: "inner", name: "Inner", parentId: "outer", locked: true }),
      createLayer("rectangle", { id: "leaf", parentId: "inner", locked: true }),
      createLayer("rectangle", { id: "sibling", parentId: "inner", locked: true }),
      createLayer("rectangle", { id: "other", locked: true }),
    ],
  });
  const engine = new EditorEngine(createProject({ pages: [page, createPage({ id: "page2" })] }));
  engine.select(["leaf"]);
  return { engine, page: engine.getSnapshot().project.pages[0]! };
}
test("unlocks only real target-chain locks outside-in with one atomic undo/redo", () => {
  const { engine, page } = fixture(),
    before = engine.getSnapshot();
  expect(blockingLocks(page, ["leaf", "inner", "leaf"]).map((layer) => layer.id)).toEqual([
    "outer",
    "inner",
    "leaf",
  ]);
  expect(captureUnlock(engine, page, ["leaf"])()).toBe(true);
  const after = engine.getSnapshot();
  expect(after.revision).toBe(before.revision + 1);
  expect(after.project.pages[0]!.layers.map((layer) => [layer.id, layer.locked])).toEqual([
    ["outer", false],
    ["inner", false],
    ["leaf", false],
    ["sibling", true],
    ["other", true],
  ]);
  expect(captureUnlock(engine, after.project.pages[0]!, ["leaf"])()).toBe(false);
  expect(engine.getSnapshot()).toBe(after);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before.project);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project).toEqual(after.project);
});
test.each(["selection", "revision", "replacement", "page"])(
  "rejects deferred %s changes",
  (kind) => {
    const { engine, page } = fixture(),
      unlock = captureUnlock(engine, page, ["leaf"]);
    if (kind === "selection") engine.select(["other"]);
    if (kind === "revision") engine.execute({ type: "updatePage", patch: { name: "Changed" } });
    if (kind === "replacement") engine.load(structuredClone(engine.getSnapshot().project));
    if (kind === "page") engine.setPage("page2");
    const current = engine.getSnapshot();
    expect(unlock()).toBe(false);
    expect(engine.getSnapshot()).toBe(current);
  },
);
test("requires canonical page, selected targets and actual existing locks", () => {
  const { engine, page } = fixture(),
    before = engine.getSnapshot();
  expect(blockingLocks(page, ["missing"])).toEqual([]);
  expect(captureUnlock(engine, { ...page }, ["leaf"])()).toBe(false);
  expect(captureUnlock(engine, page, ["other"])()).toBe(false);
  expect(captureUnlock(engine, page, ["missing"])()).toBe(false);
  expect(engine.getSnapshot()).toBe(before);
});

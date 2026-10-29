import { expect, test } from "vitest";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { freezeValue } from "../../src/document/immutable";
import { createCommandDraft } from "../../src/session/drafts";
import { EditorEngine } from "../../src/session/engine";
import type { Command } from "../../src/document/model";
test("uses domain opt-ins only for one validated mutation domain on an immutable session", () => {
  const input = createProject({
    pages: [createPage({ layers: [createLayer("rectangle", { id: "r" })] })],
  });
  const pageId = input.pages[0]!.id;
  const command = { type: "updateLayers" as const, ids: ["r"], patch: { x: 12 } };
  expect(createCommandDraft(input, pageId, [command]).assets).not.toBe(input.assets);
  const project = freezeValue(input);
  expect(createCommandDraft(project, pageId, [command]).assets).toBe(project.assets);
  expect(
    createCommandDraft(project, pageId, [{ type: "updateLayerPatches", patches: [] }]).assets,
  ).toBe(project.assets);
  for (const commands of [
    [],
    [command, command],
    [{ type: "renameProject" as const, name: "New" }],
  ])
    expect(createCommandDraft(project, pageId, commands).assets).not.toBe(project.assets);
});

test("copies only patch targets and preserves immutable neighbors through commit and undo", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id: "p",
          layers: [createLayer("rectangle", { id: "a" }), createLayer("rectangle", { id: "b" })],
        }),
      ],
    }),
  );
  const before = engine.getSnapshot(),
    untouched = before.project.pages[0]!.layers[1]!;
  engine.execute({ type: "updateLayers", ids: ["a"], patch: { fill: "#123456" } });
  const after = engine.getSnapshot();
  expect(after.project.pages[0]!.layers[0]!.fill).toBe("#123456");
  expect(after.project.pages[0]!.layers[1]).toBe(untouched);
  expect(before.project.pages[0]!.layers[0]!.fill).not.toBe("#123456");
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before.project);
  engine.redo();
  expect(engine.getSnapshot().project).toBe(after.project);
});

test("copies all layers when mask removal may release an unselected source", () => {
  const project = freezeValue(
    createProject({
      pages: [
        createPage({
          id: "p",
          layers: [
            createLayer("rectangle", { id: "a" }),
            createLayer("rectangle", { id: "b", maskSource: true }),
          ],
        }),
      ],
    }),
  );
  for (const command of [
    { type: "updateLayers", ids: ["a"], patch: { mask: null } },
    { type: "updateLayerPatches", patches: [{ id: "a", patch: { mask: null } }] },
  ] satisfies Command[]) {
    const draft = createCommandDraft(project, "p", [command]);
    expect(draft.pages[0]!.layers[1]).not.toBe(project.pages[0]!.layers[1]);
  }
});

test("rejects invalid draft inputs atomically and ignores inherited reservation metadata", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          layers: [createLayer("rectangle", { id: "a" }), createLayer("rectangle", { id: "b" })],
        }),
      ],
    }),
  );
  const before = engine.getSnapshot();
  expect(() =>
    engine.execute({ type: "updateLayers", ids: ["a"], patch: null } as unknown as Command),
  ).toThrow(expect.objectContaining({ code: "INVALID_COMMAND" }));
  expect(engine.getSnapshot()).toBe(before);
  engine.execute({
    type: "groupLayers",
    ids: ["a", "b"],
    reservation: Object.create({ id: "group-1" }),
  } as Command);
  expect(engine.getSnapshot().selection).toEqual(["group-1"]);
});

test("page metadata preserves unrelated immutable resources, validates atomically, and replays exact snapshots", () => {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({ id: "p", layers: [createLayer("rectangle", { id: "a" })] }),
        createPage({ id: "other" }),
      ],
    }),
  );
  engine.select(["a"]);
  const before = engine.getSnapshot(),
    page = before.project.pages[0]!;
  engine.execute({ type: "updatePage", patch: { rulers: true } });
  const after = engine.getSnapshot(),
    changed = after.project.pages[0]!;
  expect(changed).not.toBe(page);
  expect(changed.rulers).toBe(true);
  expect(page.rulers).not.toBe(true);
  expect(changed.layers).toBe(page.layers);
  expect(changed.guides).toBe(page.guides);
  expect(changed.margins).toBe(page.margins);
  expect(after.project.assets).toBe(before.project.assets);
  expect(after.project.pages[1]).toBe(before.project.pages[1]);
  expect(after.selection).toEqual(["a"]);
  expect(Object.isFrozen(changed)).toBe(true);
  for (const patch of [{ width: -1 }, { layers: [] }]) {
    expect(() => engine.execute({ type: "updatePage", patch })).toThrow();
    expect(engine.getSnapshot()).toBe(after);
  }
  engine.undo();
  expect(engine.getSnapshot().project).toBe(before.project);
  engine.redo();
  expect(engine.getSnapshot().project).toBe(after.project);
});

test("page nested metadata is copied from commands without modifying shared neighbors", () => {
  const engine = new EditorEngine(createProject());
  const before = engine.getSnapshot().project.pages[0]!;
  const margins = { top: 1, right: 2, bottom: 3, left: 4 };
  engine.execute({ type: "updatePage", patch: { margins } });
  const after = engine.getSnapshot().project.pages[0]!;
  margins.left = 999;
  expect(after.margins).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
  expect(after.margins).not.toBe(before.margins);
  expect(after.layers).toBe(before.layers);
  const snapshot = engine.getSnapshot();
  expect(() =>
    engine.transaction([
      { type: "updatePage", patch: { rulers: true } },
      { type: "updatePage", patch: { height: -1 } },
    ]),
  ).toThrow();
  expect(engine.getSnapshot()).toBe(snapshot);
});

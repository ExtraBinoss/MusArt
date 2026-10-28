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

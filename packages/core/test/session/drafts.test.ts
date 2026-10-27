import { expect, test } from "vitest";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { freezeValue } from "../../src/document/immutable";
import { createCommandDraft } from "../../src/session/drafts";
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

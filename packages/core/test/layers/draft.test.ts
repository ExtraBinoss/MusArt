import { expect, test } from "vitest";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { freezeValue } from "../../src/document/immutable";
import { createLayerPatchDraft } from "../../src/layers/draft";
test("isolates every writable layer field while preserving immutable nested resources and other pages", () => {
  const project = freezeValue(
    createProject({
      pages: [
        createPage({ id: "active", layers: [createLayer("rectangle", { id: "r", x: 0 })] }),
        createPage({ id: "other" }),
      ],
    }),
  );
  const draft = createLayerPatchDraft(project, "active");
  const before = project.pages[0]!.layers[0]!;
  const layer = draft.pages[0]!.layers[0]!;
  layer.x = 75;
  expect(before.x).toBe(0);
  expect(layer.effects).toBe(before.effects);
  expect(draft.assets).toBe(project.assets);
  expect(draft.pages[1]).toBe(project.pages[1]);
  expect(draft.pages[0]).not.toBe(project.pages[0]);
});

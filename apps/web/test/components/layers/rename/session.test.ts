import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import {
  captureLayerRename,
  commitLayerRename,
} from "../../../../src/components/layers/rename/session";
function fixture() {
  const parent = createLayer("group", { id: "group" }),
    layer = createLayer("image", {
      id: "image",
      name: "Old",
      parentId: parent.id,
      assetId: "photo",
    });
  const engine = new EditorEngine(
    createProject({
      pages: [createPage({ id: "page", layers: [parent, layer] })],
      assets: {
        photo: {
          id: "photo",
          name: "Photo",
          mime: "image/png",
          width: 1,
          height: 1,
          dataUrl: "data:image/png;base64,iVBORw0KGgo=",
        },
      },
    }),
  );
  return { engine, layer, parent };
}
test("trims the name in one validated command/undo and leaves empty or unchanged drafts alone", () => {
  const d = fixture(),
    origin = captureLayerRename(d.engine, "page", "image")!,
    before = d.engine.getSnapshot();
  expect(commitLayerRename(d.engine, origin, "   ")).toBe("unchanged");
  expect(commitLayerRename(d.engine, origin, " Old ")).toBe("unchanged");
  expect(d.engine.getSnapshot()).toBe(before);
  expect(commitLayerRename(d.engine, origin, " New ")).toBe("applied");
  expect(d.engine.getSnapshot().project.pages[0]!.layers[1]!.name).toBe("New");
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(before.project);
});
test("same-ID reloads, changed revisions and locked ancestors cannot adopt an old draft", () => {
  const d = fixture(),
    origin = captureLayerRename(d.engine, "page", "image")!;
  d.engine.load(structuredClone(d.engine.getSnapshot().project));
  expect(commitLayerRename(d.engine, origin, "Wrong")).toBe("changed");
  d.engine.execute({ type: "updateLayers", ids: [d.parent.id], patch: { locked: true } });
  expect(captureLayerRename(d.engine, "page", "image")).toBeNull();
  expect(captureLayerRename(d.engine, "missing", "image")).toBeNull();
});
test("validated command failures remain failures", () => {
  const d = fixture(),
    origin = captureLayerRename(d.engine, "page", "image")!;
  vi.spyOn(d.engine, "execute").mockImplementation(() => {
    throw Error("Rejected");
  });
  expect(commitLayerRename(d.engine, origin, "New")).toBe("failed");
});

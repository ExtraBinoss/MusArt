import { expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  createLayerGeometryIndex,
} from "../../src/index";
import { copyContent, parseClipboard } from "../../src/clipboard/content";
import { pasteContent } from "../../src/clipboard/paste";

function fixture() {
  const group = createLayer("group", {
    id: "group",
    x: 20,
    y: 30,
    width: 100,
    height: 120,
    guides: [{ id: "layer-guide", axis: "y", position: 12 }],
    effects: [createEffect("brightness", { id: "fx" })],
  });
  const image = createLayer("image", {
    id: "image",
    parentId: group.id,
    x: 5,
    y: 10,
    width: 60,
    height: 50,
    assetId: "photo",
    mask: { assetId: "photo", enabled: true, inverted: false },
  });
  const asset = {
    id: "photo",
    name: "Photo",
    mime: "image/png",
    width: 60,
    height: 50,
    dataUrl: "data:image/png;base64,AAAA",
  };
  const page = createPage({
    id: "source",
    width: 320,
    height: 240,
    layers: [group, image],
    guides: [{ id: "page-guide", axis: "x", position: 20 }],
    background: "#123456",
  });
  const destination = createPage({ id: "destination", width: 640, height: 480 });
  const engine = new EditorEngine(
    createProject({ id: "project", pages: [page, destination], assets: { photo: asset } }),
  );
  engine.select([group.id]);
  let sequence = 0;
  return { engine, group, image, page, destination, asset, allocate: () => `pasted-${++sequence}` };
}

it("pastes a fully remapped hierarchy at the requested pointer center in one undoable transaction", () => {
  const d = fixture(),
    content = parseClipboard(copyContent(d.engine.getSnapshot()), d.engine.getSnapshot().project);
  d.engine.setPage(d.destination.id);
  const before = d.engine.getSnapshot();
  const plan = pasteContent(content, before.project, { x: 200, y: 180 }, d.allocate);
  d.engine.transaction(plan.commands);
  d.engine.select(plan.selection);
  const after = d.engine.getSnapshot();
  expect(after.revision).toBe(before.revision + 1);
  const layers = after.project.pages[1]!.layers;
  const parent = layers.find((layer) => layer.kind === "group")!,
    image = layers.find((layer) => layer.kind === "image")!;
  expect(image.parentId).toBe(parent.id);
  expect(image.id).not.toBe(d.image.id);
  expect(parent.id).not.toBe(d.group.id);
  expect(parent.effects[0]!.id).not.toBe("fx");
  expect(parent.guides![0]!.id).not.toBe("layer-guide");
  expect(image.assetId).toBe(d.asset.id);
  expect(image.mask!.assetId).toBe(d.asset.id);
  expect(Object.keys(after.project.assets)).toEqual([d.asset.id]);
  expect(plan.selection).toEqual([parent.id]);
  expect(createLayerGeometryIndex(after.project.pages[1]!).worldBounds(parent.id)).toMatchObject({
    x: 150,
    y: 120,
  });
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(before.project);
  d.engine.redo();
  expect(d.engine.getSnapshot().project.pages[1]!.layers).toHaveLength(2);
});
it("pastes included images into a different project and rejects partial transaction writes", () => {
  const d = fixture(),
    destination = new EditorEngine(createProject());
  const content = parseClipboard(
    copyContent(d.engine.getSnapshot()),
    destination.getSnapshot().project,
  );
  const plan = pasteContent(
    content,
    destination.getSnapshot().project,
    { x: 100, y: 100 },
    d.allocate,
  );
  destination.transaction(plan.commands);
  const image = destination
    .getSnapshot()
    .project.pages[0]!.layers.find((layer) => layer.kind === "image")!;
  expect(image.assetId).not.toBe(d.asset.id);
  expect(destination.getSnapshot().project.assets[image.assetId!]!.dataUrl).toBe(d.asset.dataUrl);
  const before = destination.getSnapshot();
  const invalid = pasteContent(content, before.project, { x: 1_100_000, y: 0 }, d.allocate);
  expect(() => destination.transaction(invalid.commands)).toThrow();
  expect(destination.getSnapshot()).toBe(before);
});
it("creates a new artboard for a full composition, preserving properties and coherent mask links", () => {
  const d = fixture();
  d.engine.execute({
    type: "addLayers",
    layers: [createLayer("rectangle", { id: "matte", maskSource: true })],
  });
  d.engine.execute({
    type: "updateLayers",
    ids: [d.image.id],
    patch: { mask: { layerId: "matte", enabled: true, inverted: true } },
  });
  const content = parseClipboard(
    copyContent(d.engine.getSnapshot(), { composition: true }),
    createProject(),
  );
  const destination = new EditorEngine(createProject());
  const plan = pasteContent(
    content,
    destination.getSnapshot().project,
    { x: 900, y: 800 },
    d.allocate,
  );
  destination.transaction(plan.commands);
  const page = destination.getSnapshot().project.pages[1]!;
  expect(plan.pageId).toBe(page.id);
  expect(page).toMatchObject({ width: 320, height: 240, background: "#123456" });
  expect(page.guides[0]!.id).not.toBe("page-guide");
  expect(page.layers.find((layer) => layer.kind === "group")!.x).toBe(20);
  const image = page.layers.find((layer) => layer.kind === "image")!;
  expect(page.layers.some((layer) => layer.id === image.mask!.layerId && layer.maskSource)).toBe(
    true,
  );
  destination.undo();
  expect(destination.getSnapshot().project.pages).toHaveLength(1);
  expect(destination.getSnapshot().project.assets).toEqual({});
});
it("avoids all destination domains and pages and fails finite-point or exhausted/invalid allocators", () => {
  const d = fixture(),
    content = parseClipboard(copyContent(d.engine.getSnapshot()), d.engine.getSnapshot().project),
    project = d.engine.getSnapshot().project;
  let attempts = 0;
  const plan = pasteContent(content, project, { x: 100, y: 100 }, () =>
    attempts++ < 3 ? "photo" : d.allocate(),
  );
  expect(plan.commands[0]!.type).toBe("addLayers");
  expect(() => pasteContent(content, project, { x: NaN, y: 0 }, d.allocate)).toThrow("point");
  expect(() => pasteContent(content, project, { x: 0, y: Infinity }, d.allocate)).toThrow("point");
  expect(() => pasteContent(content, project, { x: 0, y: 0 }, () => "photo")).toThrow("exhausted");
  expect(() => pasteContent(content, project, { x: 0, y: 0 }, () => "")).toThrow("identity");
});
it("preserves locked parent and child flags without weakening existing parent-lock validation", () => {
  const d = fixture();
  d.engine.execute({
    type: "updateLayerPatches",
    patches: [
      { id: d.group.id, patch: { locked: true } },
      { id: d.image.id, patch: { locked: true } },
    ],
  });
  const content = parseClipboard(
    copyContent(d.engine.getSnapshot()),
    d.engine.getSnapshot().project,
  );
  d.engine.setPage(d.destination.id);
  const before = d.engine.getSnapshot();
  const plan = pasteContent(content, before.project, { x: 200, y: 180 }, d.allocate);
  d.engine.transaction(plan.commands);
  expect(d.engine.getSnapshot().project.pages[1]!.layers.every((layer) => layer.locked)).toBe(true);
  expect(d.engine.getSnapshot().revision).toBe(before.revision + 1);
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(before.project);
});

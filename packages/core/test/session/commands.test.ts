import { describe, expect, it } from "vitest";
import { applyCommand, currentPage } from "../../src/session/commands";
import { EditorEngine } from "../../src/session/engine";
import { createEffect, createLayer, createPage, createProject } from "../../src/document/factories";
import { getWorldBounds } from "../../src/layers/geometry";
import type { Command, Layer } from "../../src/document/model";

function setup(layers: Layer[] = []) {
  const project = createProject({ pages: [createPage({ layers })] });
  const engine = new EditorEngine(project);
  return {
    engine,
    page: () => currentPage(engine.getSnapshot().project, engine.getSnapshot().pageId),
  };
}
function asset(id = "asset") {
  return {
    id,
    name: "Photo",
    mime: "image/png",
    width: 1,
    height: 1,
    dataUrl: "data:image/png;base64,AAAA",
  };
}
describe("document commands", () => {
  it("adds multiple layers and original assets atomically, without aliasing input", () => {
    const { engine, page } = setup();
    const first = createLayer("image", { assetId: "asset" });
    const second = createLayer("text");
    engine.execute({ type: "addLayers", layers: [first, second], assets: [asset()] });
    expect(page().layers.map((layer) => layer.id)).toEqual([first.id, second.id]);
    expect(engine.getSnapshot().selection).toEqual([first.id, second.id]);
    expect(engine.getSnapshot().project.assets.asset).toEqual(asset());
    engine.undo();
    expect(page().layers).toEqual([]);
    expect(engine.getSnapshot().project.assets).toEqual({});
    const before = engine.getSnapshot();
    expect(() =>
      engine.execute({ type: "addLayers", layers: [createLayer("image", { assetId: "missing" })] }),
    ).toThrow();
    expect(engine.getSnapshot()).toBe(before);
    engine.execute({ type: "addAssets", assets: [asset()] });
    expect(() => engine.execute({ type: "addAssets", assets: [asset()] })).toThrow("déjà présente");
    expect(() => engine.execute({ type: "addLayers", layers: [], assets: [asset()] })).toThrow(
      "déjà présente",
    );
  });
  it("updates multiple layers atomically and rejects identity or hierarchy mutations", () => {
    const a = createLayer("rectangle");
    const b = createLayer("ellipse");
    const { engine, page } = setup([a, b]);
    engine.execute({
      type: "updateLayers",
      ids: [a.id, b.id],
      patch: { fill: "#000000", opacity: 0.5 },
    });
    expect(page().layers.every((layer) => layer.fill === "#000000" && layer.opacity === 0.5)).toBe(
      true,
    );
    for (const patch of [{ id: "other" }, { kind: "text" }, { parentId: null }] as const)
      expect(() => engine.execute({ type: "updateLayers", ids: [a.id], patch })).toThrow(
        "immuables",
      );
    const before = engine.getSnapshot();
    expect(() =>
      engine.execute({ type: "updateLayers", ids: [a.id, "missing"], patch: { x: 500 } }),
    ).toThrow();
    expect(engine.getSnapshot()).toBe(before);
  });
  it("deletes a group and all descendants, and restores the complete tree with undo", () => {
    const group = createLayer("group");
    const nested = createLayer("group", { parentId: group.id });
    const child = createLayer("rectangle", { parentId: nested.id });
    const survivor = createLayer("ellipse");
    const { engine, page } = setup([group, nested, child, survivor]);
    engine.execute({ type: "deleteLayers", ids: [group.id] });
    expect(page().layers.map((layer) => layer.id)).toEqual([survivor.id]);
    engine.undo();
    expect(page().layers).toHaveLength(4);
    engine.execute({ type: "updateLayers", ids: [child.id], patch: { locked: true } });
    expect(() => engine.execute({ type: "deleteLayers", ids: [group.id] })).toThrow("verrouillé");
  });
  it("creates nested groups, preserves positions and rejects mixed parents", () => {
    const a = createLayer("rectangle", { x: 30, y: 40, rotation: 20 });
    const b = createLayer("ellipse", { x: 500, y: 60 });
    const { engine, page } = setup([a, b]);
    const before = getWorldBounds(page(), a.id);
    engine.execute({ type: "groupLayers", ids: [a.id, b.id] });
    const groupId = engine.getSnapshot().selection[0]!;
    expect(page().layers.find((layer) => layer.id === groupId)).toMatchObject({
      kind: "group",
      parentId: null,
      x: 0,
      y: 0,
    });
    expect(page().layers[0]?.parentId).toBe(groupId);
    expect(getWorldBounds(page(), a.id)).toEqual(before);
    engine.execute({ type: "groupLayers", ids: [a.id] });
    const nestedId = engine.getSnapshot().selection[0]!;
    expect(page().layers.find((layer) => layer.id === nestedId)?.parentId).toBe(groupId);
    expect(() => engine.execute({ type: "groupLayers", ids: [a.id, b.id] })).toThrow("même parent");
    expect(() => engine.execute({ type: "groupLayers", ids: [] })).toThrow("Sélectionnez");
  });
  it("ungroups transformed children with world geometry preserved and refuses lossy effect flattening", () => {
    const group = createLayer("group", {
      x: 100,
      y: 200,
      width: 200,
      height: 200,
      rotation: 90,
      visible: false,
    });
    const child = createLayer("rectangle", {
      parentId: group.id,
      x: 20,
      y: 30,
      width: 40,
      height: 20,
      rotation: 30,
    });
    const { engine, page } = setup([group, child]);
    const before = getWorldBounds(page(), child.id);
    engine.execute({ type: "ungroupLayers", ids: [group.id] });
    expect(page().layers).toHaveLength(1);
    expect(page().layers[0]).toMatchObject({ parentId: null, rotation: 120, visible: false });
    const after = getWorldBounds(page(), child.id);
    for (const key of ["x", "y", "width", "height"] as const)
      expect(after[key]).toBeCloseTo(before[key]);
    expect(engine.getSnapshot().selection).toEqual([child.id]);
    expect(() => engine.execute({ type: "ungroupLayers", ids: [child.id] })).toThrow(
      "pas un groupe",
    );
    const withEffect = createLayer("group", { effects: [createEffect("dither")] });
    const other = setup([withEffect]);
    expect(() => other.engine.execute({ type: "ungroupLayers", ids: [withEffect.id] })).toThrow(
      "Retirez",
    );
    const emptyGroup = createLayer("group");
    const empty = setup([emptyGroup]);
    empty.engine.execute({ type: "ungroupLayers", ids: [emptyGroup.id] });
    expect(empty.page().layers).toEqual([]);
  });
  it("reorders layers and validates reparenting, cycles and locked destinations", () => {
    const a = createLayer("rectangle", { rotation: 30 });
    const b = createLayer("ellipse");
    const group = createLayer("group", { x: 200, y: 500, rotation: 45 });
    const { engine, page } = setup([a, b, group]);
    engine.execute({ type: "reorderLayer", id: a.id, index: 1 });
    expect(page().layers.map((layer) => layer.id)).toEqual([b.id, a.id, group.id]);
    const bounds = getWorldBounds(page(), a.id);
    engine.execute({ type: "reorderLayer", id: a.id, index: 0, parentId: group.id });
    const reparented = getWorldBounds(page(), a.id);
    for (const key of ["x", "y", "width", "height"] as const)
      expect(reparented[key]).toBeCloseTo(bounds[key]);
    expect(page().layers[0]?.parentId).toBe(group.id);
    expect(() =>
      engine.execute({ type: "reorderLayer", id: group.id, index: 1, parentId: group.id }),
    ).toThrow("cyclique");
    expect(() =>
      engine.execute({ type: "reorderLayer", id: b.id, index: 1, parentId: a.id }),
    ).toThrow("non groupé");
    expect(() => engine.execute({ type: "reorderLayer", id: b.id, index: -1 })).toThrow("Position");
    engine.execute({ type: "reorderLayer", id: a.id, index: 2, parentId: null });
    expect(page().layers[2]?.parentId).toBeNull();
    engine.execute({ type: "updateLayers", ids: [group.id], patch: { locked: true } });
    expect(() =>
      engine.execute({ type: "reorderLayer", id: b.id, index: 0, parentId: group.id }),
    ).toThrow("verrouillé");
    expect(() =>
      engine.execute({
        type: "addLayers",
        layers: [createLayer("rectangle", { parentId: group.id })],
      }),
    ).toThrow("verrouillé");
  });
  it("creates, edits and deletes compositions while preserving a nonempty project", () => {
    const { engine, page } = setup();
    const firstId = page().id;
    expect(() => engine.execute({ type: "deletePage", id: firstId })).toThrow("dernière");
    engine.execute({ type: "addPage" });
    const nextId = page().id;
    expect(nextId).not.toBe(firstId);
    expect(page().name).toBe("Composition 2");
    engine.execute({
      type: "updatePage",
      patch: { name: "Story", width: 1080, height: 1920, background: "transparent" },
    });
    expect(page()).toMatchObject({
      name: "Story",
      width: 1080,
      height: 1920,
      background: "transparent",
    });
    expect(() => engine.execute({ type: "updatePage", patch: { id: "other" } })).toThrow(
      "non modifiable",
    );
    expect(() => engine.execute({ type: "deletePage", id: "missing" })).toThrow("introuvable");
    engine.execute({ type: "deletePage", id: firstId });
    expect(page().id).toBe(nextId);
    engine.execute({ type: "addPage", page: createPage({ name: "Poster" }) });
    const posterId = page().id;
    engine.execute({ type: "deletePage", id: posterId });
    expect(page().id).toBe(nextId);
    engine.undo();
    expect(page().id).toBe(posterId);
  });
  it("manages guides and project titles through the same undoable command path", () => {
    const { engine, page } = setup();
    engine.execute({ type: "addGuide", guide: { id: "margin-left", axis: "x", position: 48 } });
    expect(page().guides).toEqual([{ id: "margin-left", axis: "x", position: 48 }]);
    expect(() => engine.execute({ type: "deleteGuide", id: "missing" })).toThrow("introuvable");
    engine.execute({ type: "deleteGuide", id: "margin-left" });
    expect(page().guides).toEqual([]);
    engine.undo();
    expect(page().guides).toHaveLength(1);
    engine.execute({ type: "renameProject", name: "MuseArt project" });
    expect(engine.getSnapshot().project.name).toBe("MuseArt project");
  });
  it("rejects unknown commands and missing pages at the pure draft boundary", () => {
    const project = createProject();
    const pageId = project.pages[0]!.id;
    expect(() => currentPage(project, "missing")).toThrow();
    expect(() => applyCommand(project, pageId, { type: "future" } as never, () => "id")).toThrow(
      "inconnue",
    );
    const unknown = { type: "updateLayers", ids: ["unknown"], patch: { x: 1 } } satisfies Command;
    expect(() => applyCommand(project, pageId, unknown, () => "id")).toThrow("introuvable");
  });
});

import { describe, expect, it, vi } from "vitest";
import { EditorEngine } from "../../src/session/engine";
import { createEffect, createLayer, createPage, createProject } from "../../src/document/factories";
import type { Command, Project } from "../../src/document/model";

function setup(project?: Project) {
  const engine = new EditorEngine(project);
  const page = () =>
    engine.getSnapshot().project.pages.find((item) => item.id === engine.getSnapshot().pageId)!;
  return { engine, page };
}
describe("immutable document session", () => {
  it("starts with a valid default and stable immutable snapshots", () => {
    const project = createProject();
    const { engine } = setup(project);
    expect(engine.getSnapshot()).toBe(engine.getSnapshot());
    expect(engine.getSnapshot()).toMatchObject({
      revision: 0,
      canUndo: false,
      canRedo: false,
      selection: [],
    });
    expect(engine.getSnapshot().project).not.toBe(project);
    expect(() => {
      engine.getSnapshot().project.name = "Tamper";
    }).toThrow();
    project.name = "Caller edit";
    expect(engine.getSnapshot().project.name).toBe("Sans titre");
    expect(() => new EditorEngine(project, { historyLimit: 0 })).toThrow();
    expect(() => new EditorEngine(project, { historyLimit: 101 })).toThrow();
  });
  it("groups a gesture into a single undo entry and restores exact states with redo", () => {
    const { engine, page } = setup();
    const rectangle = createLayer("rectangle", { id: "rectangle", x: 10 });
    engine.execute({ type: "addLayers", layers: [rectangle] });
    expect(engine.getSnapshot().selection).toEqual(["rectangle"]);
    engine.transaction([
      { type: "updateLayers", ids: ["rectangle"], patch: { x: 20 } },
      { type: "updateLayers", ids: ["rectangle"], patch: { x: 30, y: 40 } },
    ]);
    expect(page().layers[0]).toMatchObject({ x: 30, y: 40 });
    engine.undo();
    expect(page().layers[0]).toMatchObject({ x: 10, y: 80 });
    engine.redo();
    expect(page().layers[0]).toMatchObject({ x: 30, y: 40 });
    engine.undo();
    engine.undo();
    expect(page().layers).toEqual([]);
    expect(engine.getSnapshot()).toMatchObject({ canUndo: false, canRedo: true });
    engine.undo();
    engine.redo();
    engine.redo();
    engine.redo();
    expect(engine.getSnapshot()).toMatchObject({ canUndo: true, canRedo: false });
    expect(page().layers[0]?.x).toBe(30);
    expect(rectangle.x).toBe(10);
  });
  it("rolls back the entire transaction on validation, missing IDs or a locked ancestor", () => {
    const parent = createLayer("group", { id: "group", locked: true });
    const child = createLayer("rectangle", { id: "child", parentId: "group" });
    const { engine } = setup(createProject({ pages: [createPage({ layers: [parent, child] })] }));
    const before = engine.getSnapshot();
    expect(() =>
      engine.transaction([
        { type: "renameProject", name: "Changed" },
        { type: "updateLayers", ids: ["child"], patch: { x: 900 } },
      ]),
    ).toThrow("verrouillé");
    expect(engine.getSnapshot()).toBe(before);
    expect(() =>
      engine.execute({ type: "updateLayers", ids: ["missing"], patch: { x: 1 } }),
    ).toThrow("introuvable");
    expect(() => engine.execute({ type: "updatePage", patch: { width: -1 } })).toThrow();
    expect(() =>
      engine.execute({
        type: "updateLayers",
        ids: ["group"],
        patch: { locked: false, opacity: 0.5 },
      }),
    ).toThrow("verrouillé");
    engine.execute({ type: "updateLayers", ids: ["group"], patch: { locked: false } });
    engine.execute({ type: "updateLayers", ids: ["child"], patch: { x: 900 } });
    expect(engine.getSnapshot().project.pages[0]!.layers[1]?.x).toBe(900);
  });
  it("publishes changes and cleans up listeners; session selection creates no document history", () => {
    const { engine } = setup();
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);
    const layer = createLayer("rectangle");
    engine.execute({ type: "addLayers", layers: [layer] });
    const revision = engine.getSnapshot().revision;
    engine.select([layer.id, layer.id]);
    expect(listener).toHaveBeenCalledTimes(1);
    engine.select([]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(engine.getSnapshot().revision).toBe(revision);
    expect(() => engine.select(["missing"])).toThrow();
    const secondPage = createPage();
    engine.execute({ type: "addPage", page: secondPage });
    expect(engine.getSnapshot().pageId).toBe(secondPage.id);
    engine.setPage(secondPage.id);
    expect(listener).toHaveBeenCalledTimes(3);
    engine.setPage(engine.getSnapshot().project.pages[0]!.id);
    expect(engine.getSnapshot().selection).toEqual([]);
    expect(() => engine.setPage("missing")).toThrow();
    unsubscribe();
    engine.select([layer.id]);
    expect(listener).toHaveBeenCalledTimes(4);
  });
  it("caps history at 100 states and discards redo after a new edit", () => {
    const { engine } = setup();
    for (let index = 0; index < 102; index += 1)
      engine.execute({ type: "renameProject", name: `Project ${index}` });
    for (let index = 0; index < 100; index += 1) engine.undo();
    expect(engine.getSnapshot().project.name).toBe("Project 1");
    expect(engine.getSnapshot().canUndo).toBe(false);
    engine.redo();
    engine.execute({ type: "renameProject", name: "New branch" });
    expect(engine.getSnapshot().canRedo).toBe(false);
    const limited = new EditorEngine(createProject(), { historyLimit: 2 });
    for (let index = 0; index < 3; index += 1)
      limited.execute({ type: "renameProject", name: `v${index}` });
    limited.undo();
    limited.undo();
    expect(limited.getSnapshot().project.name).toBe("v0");
  });
  it("loads a validated isolated project and clears stale history and selection", () => {
    const { engine } = setup();
    engine.execute({ type: "addLayers", layers: [createLayer("ellipse")] });
    const project = createProject({ name: "Loaded" });
    engine.load(project);
    expect(engine.getSnapshot()).toMatchObject({
      project: { name: "Loaded" },
      canUndo: false,
      canRedo: false,
      selection: [],
    });
    project.name = "Caller tamper";
    expect(engine.getSnapshot().project.name).toBe("Loaded");
    const before = engine.getSnapshot();
    expect(() => engine.load({} as never)).toThrow();
    expect(engine.getSnapshot()).toBe(before);
  });
  it("preserves embedded source strings and stamps commits through an injected clock", () => {
    const { engine } = setup();
    const asset = {
      id: "asset",
      name: "Pixel",
      mime: "image/png",
      width: 1,
      height: 1,
      dataUrl: "data:image/png;base64,AAAA",
    };
    engine.execute({ type: "addAssets", assets: [asset] });
    asset.name = "Mutated caller";
    expect(engine.getSnapshot().project.assets.asset?.name).toBe("Pixel");
    const timed = new EditorEngine(createProject(), { now: () => "2026-10-27T00:00:00.000Z" });
    timed.execute({ type: "renameProject", name: "Timed" });
    expect(timed.getSnapshot().project.updatedAt).toBe("2026-10-27T00:00:00.000Z");
  });
  it("handles empty transactions and wraps malformed commands with stable errors", () => {
    const { engine } = setup();
    const before = engine.getSnapshot();
    engine.transaction([]);
    expect(engine.getSnapshot()).toBe(before);
    expect(() =>
      engine.transaction(
        Array.from({ length: 1001 }, () => ({ type: "renameProject", name: "x" })) as Command[],
      ),
    ).toThrow("longue");
    expect(() => engine.transaction(null as never)).toThrow("invalide");
    expect(() => engine.execute(null as never)).toThrow();
    expect(() => engine.execute({ type: "unknown" } as never)).toThrow("Commande inconnue");
    const throwing = new EditorEngine(createProject(), {
      now: () => {
        throw "clock failed";
      },
    });
    expect(() => throwing.execute({ type: "renameProject", name: "x" })).toThrow(
      "Commande invalide",
    );
  });
  it("does not reuse occupied IDs when duplicating and preserves effect ordering", () => {
    const group = createLayer("group", { id: "layer-1" });
    const child = createLayer("rectangle", {
      id: "child",
      parentId: group.id,
      effects: [createEffect("grayscale"), createEffect("dither")],
    });
    const { engine, page } = setup(
      createProject({
        pages: [
          createPage({
            layers: [group, child],
            guides: [{ id: "layer-2", axis: "y", position: 30 }],
          }),
        ],
      }),
    );
    engine.execute({ type: "duplicateLayers", ids: [group.id, child.id] });
    expect(page().layers).toHaveLength(4);
    const duplicateGroup = page().layers[2]!;
    const duplicateChild = page().layers[3]!;
    expect(duplicateGroup.id).not.toBe("layer-1");
    expect(duplicateGroup.id).not.toBe("layer-2");
    expect(duplicateGroup).toMatchObject({ x: 104, y: 104 });
    expect(duplicateChild).toMatchObject({ x: 80, y: 80, parentId: duplicateGroup.id });
    expect(duplicateChild.effects.map((effect) => effect.type)).toEqual(["grayscale", "dither"]);
    expect(duplicateChild.effects[0]?.id).not.toBe(child.effects[0]?.id);
    engine.undo();
    expect(page().layers).toHaveLength(2);
    engine.redo();
    expect(page().layers).toHaveLength(4);
    engine.execute({ type: "duplicateLayers", ids: [child.id] });
    expect(page().layers.at(-1)?.parentId).toBe(group.id);
  });
  it("reserves explicit IDs introduced earlier or later within one atomic transaction", () => {
    const { engine, page } = setup();
    const rectangle = createLayer("rectangle", { id: "group-1" });
    engine.transaction([
      { type: "addLayers", layers: [rectangle] },
      { type: "groupLayers", ids: [rectangle.id] },
    ]);
    const group = page().layers.find((layer) => layer.kind === "group")!;
    expect(group.id).toBe("group-2");
    expect(page().layers.find((layer) => layer.id === rectangle.id)?.parentId).toBe(group.id);
    engine.undo();
    expect(page().layers).toEqual([]);
    const futurePage = createPage({ id: "page-1" });
    const other = new EditorEngine(createProject());
    other.transaction([{ type: "addPage" }, { type: "addPage", page: futurePage }]);
    const ids = other.getSnapshot().project.pages.map((item) => item.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[1]).toBe("page-2");
  });
});

import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject } from "@musart/core";
import { setup } from "../../support/ui";
import {
  createSearchActions,
  executeSearchItem,
  type SearchActions,
} from "../../../src/components/search/actions";
import type { SearchItem } from "../../../src/components/search/catalog/model";
import { createViewportActions } from "../../../src/canvas/session/viewport-actions";

function context() {
  const d = setup();
  const context: SearchActions = {
    engine: d.engine,
    services: d.services,
    t: (key) => key,
    onImport: vi.fn(),
    onImportSvg: vi.fn(),
    onOpenPortable: vi.fn(),
    onProjects: vi.fn(),
    onExport: vi.fn(),
    onPanelMode: vi.fn(),
    onShortcuts: vi.fn(),
    setTool: vi.fn(),
    setTheme: vi.fn(),
    setLanguage: vi.fn().mockResolvedValue(undefined),
  };
  return { ...d, context, actions: createSearchActions(context) };
}
const item = (target: SearchItem["target"]): SearchItem => ({
  id: "test",
  category: "edit",
  label: "test",
  terms: "",
  target,
});
test("routes tools, dialogs, imports, saving, theme/language and viewport requests through shared ports", async () => {
  const { context: ctx, actions, services, engine } = context();
  for (const name of [
    "toolPointer",
    "toolHand",
    "toolShape",
    "toolRectangle",
    "toolEllipse",
    "toolText",
    "toolWand",
    "toolSegment",
  ] as const)
    actions[name]();
  expect(vi.mocked(ctx.setTool).mock.calls.map(([value]) => value)).toEqual([
    "pointer",
    "hand",
    "shape",
    "rectangle",
    "ellipse",
    "text",
    "wand",
    "segment",
  ]);
  for (const name of [
    "importImages",
    "importSvg",
    "openPortable",
    "exportImage",
    "shortcuts",
  ] as const)
    actions[name]();
  for (const callback of [
    ctx.onImport,
    ctx.onImportSvg,
    ctx.onOpenPortable,
    ctx.onExport,
    ctx.onShortcuts,
  ])
    expect(callback).toHaveBeenCalledOnce();
  for (const name of ["projects", "newProject", "settings"] as const) actions[name]();
  expect(vi.mocked(ctx.onProjects).mock.calls.map(([value]) => value)).toEqual([
    "projects",
    "newProject",
    "settings",
  ]);
  actions.design();
  actions.animate();
  expect(vi.mocked(ctx.onPanelMode).mock.calls.map(([value]) => value)).toEqual([
    "design",
    "animate",
  ]);
  for (const name of ["themeLight", "themeDark", "themeSystem"] as const) actions[name]();
  expect(vi.mocked(ctx.setTheme).mock.calls.map(([value]) => value)).toEqual([
    "light",
    "dark",
    "system",
  ]);
  await actions.languageEnglish();
  await actions.languageFrench();
  expect(vi.mocked(ctx.setLanguage).mock.calls.map(([value]) => value)).toEqual(["en", "fr"]);
  await actions.save();
  await actions.exportProject();
  expect(services.saveProject).toHaveBeenCalledOnce();
  expect(services.exportProject).toHaveBeenCalledOnce();
  const view = vi.fn(),
    dispose = createViewportActions(engine).subscribe(view);
  for (const name of ["fit", "reset", "recenter", "zoomIn", "zoomOut"] as const) actions[name]();
  expect(view.mock.calls.flat()).toEqual(["fit", "reset", "recenter", "zoomIn", "zoomOut"]);
  dispose();
});
test("commits document actions with genuine undo/redo and current selection", () => {
  const d = context();
  d.actions.selectAll();
  expect(d.engine.getSnapshot().selection).toHaveLength(3);
  d.actions.deselect();
  expect(d.engine.getSnapshot().selection).toEqual([]);
  d.engine.select([d.rectangle.id]);
  d.actions.toggleVisibility();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.visible).toBe(false);
  d.actions.toggleVisibility();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.visible).toBe(true);
  d.actions.toggleLock();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.locked).toBe(true);
  d.actions.toggleLock();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.locked).toBe(false);
  d.actions.duplicate();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(4);
  d.actions.delete();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(3);
  d.actions.undo();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(4);
  d.actions.redo();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(3);
  d.engine.select([d.rectangle.id, d.text.id]);
  d.actions.group();
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.some((layer) => layer.kind === "group"),
  ).toBe(true);
  d.actions.ungroup();
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.some((layer) => layer.kind === "group"),
  ).toBe(false);
  d.actions.rulers();
  expect(d.engine.getSnapshot().project.pages[0]!.rulers).toBe(true);
  d.actions.rulers();
  expect(d.engine.getSnapshot().project.pages[0]!.rulers).toBe(false);
  d.actions.addPage();
  expect(d.engine.getSnapshot().project.pages[1]).toMatchObject({
    name: "composition 2",
    width: d.page.width,
    height: d.page.height,
    background: d.page.background,
  });
});
test("selects pages and layers across pages without adding history, and reports stale results", async () => {
  const d = context();
  const layer = createLayer("rectangle", { name: "Target" }),
    page = createPage({ layers: [layer] });
  d.engine.execute({ type: "addPage", page });
  const revision = d.engine.getSnapshot().revision;
  await executeSearchItem(item({ kind: "page", pageId: d.page.id }), d.context);
  expect(d.engine.getSnapshot().pageId).toBe(d.page.id);
  await executeSearchItem(item({ kind: "layer", pageId: page.id, layerId: layer.id }), d.context);
  expect(d.engine.getSnapshot()).toMatchObject({
    pageId: page.id,
    selection: [layer.id],
    revision,
  });
  expect(() =>
    executeSearchItem(item({ kind: "layer", pageId: page.id, layerId: "removed" }), d.context),
  ).toThrow();
  expect(() => executeSearchItem(item({ kind: "page", pageId: "removed" }), d.context)).toThrow();
  await executeSearchItem(item({ kind: "action", action: "toolText" }), d.context);
  expect(d.context.setTool).toHaveBeenCalledWith("text");
});
test("adds effects atomically to all selected layers and refuses locked or missing selections", async () => {
  const d = context(),
    target = item({ kind: "effect", effect: "dither" });
  expect(() => executeSearchItem(target, d.context)).toThrow("search:noSelection");
  d.engine.select([d.rectangle.id, d.text.id]);
  await executeSearchItem(target, d.context);
  expect(
    d.engine
      .getSnapshot()
      .project.pages[0]!.layers.slice(0, 2)
      .every((layer) => layer.effects[0]?.type === "dither"),
  ).toBe(true);
  d.engine.undo();
  expect(
    d.engine
      .getSnapshot()
      .project.pages[0]!.layers.slice(0, 2)
      .every((layer) => layer.effects.length === 0),
  ).toBe(true);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } });
  d.engine.select([d.rectangle.id]);
  expect(() => executeSearchItem(target, d.context)).toThrow("search:noSelection");
  d.engine.undo();
  d.engine.select([d.rectangle.id, d.text.id]);
  d.engine.execute({ type: "groupLayers", ids: d.engine.getSnapshot().selection });
  const groupId = d.engine.getSnapshot().selection[0]!;
  d.engine.execute({ type: "updateLayers", ids: [groupId], patch: { locked: true } });
  d.engine.select([d.text.id]);
  expect(() => executeSearchItem(target, d.context)).toThrow("search:noSelection");
});

test("adds the real lazy techno artboard as one undoable command and activates it", async () => {
  const d = context();
  await d.actions.addTechnoArtboard();
  const snapshot = d.engine.getSnapshot(),
    page = snapshot.project.pages.at(-1)!;
  expect(page.name).toBe("AFTERHOURS — Techno");
  expect(page.layers.length).toBeGreaterThan(100);
  expect(snapshot.pageId).toBe(page.id);
  expect(snapshot.project.pages).toHaveLength(2);
  d.engine.undo();
  expect(d.engine.getSnapshot().project.pages).toHaveLength(1);
  d.engine.redo();
  expect(d.engine.getSnapshot().project.pages.at(-1)).toEqual(page);
});

test("a lazy template cannot add artwork into a project opened while it loads", async () => {
  const d = context();
  const pending = d.actions.addTechnoArtboard();
  const other = createProject();
  d.engine.load(other);
  await expect(pending).rejects.toThrow("search:templateChanged");
  expect(d.engine.getSnapshot().project).toEqual(other);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

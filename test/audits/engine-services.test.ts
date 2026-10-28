import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getWorldBounds,
  parseProject,
  serializeProject,
  type Asset,
  type Project,
} from "../../packages/core/src/index";
import { installAutosave, ProjectStore } from "../../apps/web/src/services/projects/storage";
import { importBatch } from "../../apps/web/src/services/assets/imports";

const stores: ProjectStore[] = [];
function store(name = crypto.randomUUID()) {
  const value = new ProjectStore(name);
  stores.push(value);
  return value;
}
function asset(data = "A"): Asset {
  return {
    id: "original",
    name: "Source",
    mime: "image/png",
    width: 16,
    height: 16,
    dataUrl: `data:image/png;base64,${data}`,
  };
}
function document(layers: ReturnType<typeof createLayer>[] = []): Project {
  return createProject({ pages: [createPage({ width: 600, height: 500, layers })] });
}
afterEach(async () => {
  vi.useRealTimers();
  for (const value of stores.splice(0)) await value.close();
});

describe("independent integration audit: document and platform boundaries", () => {
  test("group then ungroup preserves root paint order with unselected siblings", () => {
    const a = createLayer("rectangle", { id: "back", fill: "#ff0000" });
    const b = createLayer("rectangle", { id: "middle", fill: "#00ff00" });
    const c = createLayer("rectangle", { id: "front", fill: "#0000ff" });
    const engine = new EditorEngine(document([a, b, c]));
    engine.execute({ type: "groupLayers", ids: [a.id, b.id] });
    const group = engine.getSnapshot().selection[0]!;
    engine.execute({ type: "ungroupLayers", ids: [group] });
    const roots = engine
      .getSnapshot()
      .project.pages[0]!.layers.filter((layer) => layer.parentId === null)
      .map((layer) => layer.id);
    expect(roots).toEqual([a.id, b.id, c.id]);
  });
  test("independent IndexedDB sessions cannot silently replace a saved original with a stale cache", async () => {
    const name = crypto.randomUUID();
    const first = store(name),
      second = store(name);
    const original = createProject({ assets: { original: asset("AAA=") } });
    await first.save(original);
    await second.save({ ...original, assets: { original: asset("BBB=") } });
    const final = { ...original, name: "First tab commits its complete document" };
    await first.save(final);
    expect(await first.load(final.id)).toEqual(final);
  });
  test("a late invalid operation rolls back earlier edits, asset insertion, history and notifications", () => {
    const locked = createLayer("rectangle", { id: "locked", locked: true });
    const engine = new EditorEngine(document([locked]));
    const notify = vi.fn();
    engine.subscribe(notify);
    const before = engine.getSnapshot();
    expect(() =>
      engine.transaction([
        { type: "addAssets", assets: [asset()] },
        { type: "addLayers", layers: [createLayer("text", { id: "new" })] },
        { type: "updateLayers", ids: [locked.id], patch: { x: 55 } },
      ]),
    ).toThrow("verrouillé");
    expect(engine.getSnapshot()).toBe(before);
    expect(notify).not.toHaveBeenCalled();
    expect(engine.getSnapshot().canUndo).toBe(false);
  });
  test("reparenting a transformed subtree preserves world geometry and undo restores its original tree", () => {
    const parent = createLayer("group", {
      id: "parent",
      x: 90,
      y: 70,
      width: 400,
      height: 300,
      rotation: 37,
    });
    const nested = createLayer("group", {
      id: "nested",
      x: 40,
      y: 35,
      width: 200,
      height: 160,
      rotation: -21,
    });
    const child = createLayer("rectangle", {
      id: "child",
      parentId: nested.id,
      x: 18,
      y: 23,
      width: 70,
      height: 45,
      rotation: 13,
    });
    const engine = new EditorEngine(document([parent, nested, child]));
    const before = engine.getSnapshot().project;
    const bounds = getWorldBounds(before.pages[0]!, child.id);
    engine.execute({ type: "reorderLayer", id: nested.id, index: 1, parentId: parent.id });
    const after = getWorldBounds(engine.getSnapshot().project.pages[0]!, child.id);
    for (const key of ["x", "y", "width", "height"] as const)
      expect(after[key]).toBeCloseTo(bounds[key]);
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(before);
  });
  test("portable roundtrip, duplicate subtree, masks and effect IDs remain independent through history", () => {
    const group = createLayer("group", {
      id: "group",
      effects: [createEffect("contrast", { id: "contrast" })],
    });
    const child = createLayer("image", {
      id: "image",
      parentId: group.id,
      assetId: "original",
      mask: { assetId: "original", enabled: true, inverted: false },
      effects: [createEffect("dither", { id: "dither" })],
    });
    const project = createProject({
      pages: [createPage({ layers: [group, child] })],
      assets: { original: asset() },
    });
    const engine = new EditorEngine(parseProject(serializeProject(project)));
    engine.execute({ type: "duplicateLayers", ids: [group.id, child.id] });
    const duplicated = engine.getSnapshot().project;
    const allIds = duplicated.pages.flatMap((page) =>
      page.layers.flatMap((layer) => [layer.id, ...layer.effects.map((effect) => effect.id)]),
    );
    expect(new Set(allIds).size).toBe(allIds.length);
    const copied = duplicated.pages[0]!.layers.find(
      (layer) => layer.kind === "image" && layer.id !== child.id,
    )!;
    expect(copied.mask).toEqual(child.mask);
    expect(copied.parentId).not.toBe(group.id);
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(project);
    engine.redo();
    expect(engine.getSnapshot().project).toEqual(duplicated);
  });
  test("bulk import decodes at most three assets concurrently and commits the resulting batch atomically", async () => {
    const files = Array.from(
      { length: 8 },
      (_, i) => new File(["png"], `image-${i}.png`, { type: "image/png" }),
    );
    let active = 0,
      max = 0;
    const page = createPage({ width: 600, height: 500 });
    const command = await importBatch(files, page, {
      dataUrl: async () => {
        active++;
        max = Math.max(max, active);
        await Promise.resolve();
        active--;
        return "data:image/png;base64,AA==";
      },
      dimensions: async () => ({ width: 16, height: 16 }),
    });
    expect(max).toBeLessThanOrEqual(3);
    const engine = new EditorEngine(createProject({ pages: [page] }));
    engine.execute(command);
    expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(8);
    expect(Object.keys(engine.getSnapshot().project.assets)).toHaveLength(8);
    engine.undo();
    expect(engine.getSnapshot().project.pages[0]!.layers).toEqual([]);
    expect(engine.getSnapshot().project.assets).toEqual({});
  });
  test("autosave serializes two document commits, ignores selection and flushes the latest state at shutdown", async () => {
    vi.useFakeTimers();
    const layer = createLayer("rectangle");
    const engine = new EditorEngine(document([layer]));
    const saved: Project[] = [];
    let active = 0,
      max = 0;
    const save = vi.fn(async (project: Project) => {
      active++;
      max = Math.max(max, active);
      await Promise.resolve();
      saved.push(project);
      active--;
    });
    const failures = vi.fn();
    const autosave = installAutosave(engine, { save }, failures, 50);
    engine.execute({ type: "renameProject", name: "A" });
    const first = autosave.flush();
    engine.execute({ type: "renameProject", name: "B" });
    const second = autosave.flush();
    await Promise.all([first, second]);
    engine.select([layer.id]);
    await vi.advanceTimersByTimeAsync(100);
    expect(saved.map((project) => project.name)).toEqual(["A", "B"]);
    expect(max).toBe(1);
    engine.execute({ type: "renameProject", name: "C" });
    await autosave.dispose();
    expect(saved.map((project) => project.name)).toEqual(["A", "B", "C"]);
    expect(failures).not.toHaveBeenCalled();
  });
});

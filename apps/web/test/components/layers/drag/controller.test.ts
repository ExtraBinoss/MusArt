import { expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { layerDragController } from "../../../../src/components/layers/drag/controller";

function fixture() {
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers: [
    createLayer("group", { id: "group" }),
    createLayer("rectangle", { id: "a", parentId: "group" }),
    createLayer("ellipse", { id: "b", parentId: "group" }),
  ] })] }));
  const page = () => engine.getSnapshot().project.pages[0]!;
  const controller = layerDragController(engine), owner = Symbol("source");
  const run = vi.fn((action: () => void) => action());
  const layer = (id: string) => page().layers.find((item) => item.id === id)!;
  return { engine, page, layer, controller, owner, run };
}

it("shares one semantic projection across views, commits once and preserves animation/undo", () => {
  const d = fixture();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({ type: "upsertMotionKeyframe", target: { kind: "layer", layerId: "a", property: "x" }, time: { value: 1, rate: 1 }, value: 42 });
  const before = d.engine.getSnapshot(), execute = vi.spyOn(d.engine, "execute"), updates = vi.fn();
  const stop = d.controller.subscribe(updates);
  expect(layerDragController(d.engine)).toBe(d.controller);
  expect(d.controller.begin(d.owner, d.page(), "a", d.run)).toBe(true);
  expect(d.controller.preview(d.page(), d.layer("b"), "before")).toBe(true);
  const projection = d.controller.read();
  expect(d.controller.preview(d.page(), d.layer("b"), "before")).toBe(true);
  expect(d.controller.read()).toBe(projection);
  expect(updates).toHaveBeenCalledTimes(2);
  expect(d.engine.getSnapshot()).toBe(before);
  expect(execute).not.toHaveBeenCalled();
  expect(d.controller.finish("a")).toBe(true);
  expect(d.controller.finish("a")).toBe(false);
  expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "reorderLayer", id: "a", index: 2, parentId: "group" });
  expect(d.page().layers.map((layer) => layer.id)).toEqual(["group", "b", "a"]);
  expect(d.page().motion).toEqual(before.project.pages[0]!.motion);
  expect(d.controller.read()).toBeNull();
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toBe(before.project);
  stop();
});

it("owner cleanup cannot cancel a replacement session, and foreign payloads never commit", () => {
  const d = fixture(), next = Symbol("replacement"), execute = vi.spyOn(d.engine, "execute");
  d.controller.begin(d.owner, d.page(), "a", d.run);
  d.controller.begin(next, d.page(), "b", d.run);
  const state = d.controller.read();
  d.controller.cancel(d.owner);
  expect(d.controller.read()).toBe(state);
  expect(d.controller.owns(next)).toBe(true);
  expect(d.controller.preview(d.page(), d.layer("a"), "after")).toBe(true);
  expect(d.controller.finish("a")).toBe(false);
  expect(execute).not.toHaveBeenCalled();
  expect(d.controller.read()).toBeNull();
});

it("retires canonical ownership on loads and rejects deferred work with reused document IDs", () => {
  const d = fixture(), execute = vi.spyOn(d.engine, "execute"), delayed: (() => void)[] = [];
  const before = d.engine.getSnapshot();
  d.controller.begin(d.owner, d.page(), "a", (action) => delayed.push(action));
  d.controller.preview(d.page(), d.layer("b"), "before");
  expect(d.controller.finish("a")).toBe(true);
  expect(delayed).toHaveLength(1);
  d.engine.load(before.project);
  delayed[0]!();
  expect(execute).not.toHaveBeenCalled();
  d.controller.begin(d.owner, d.page(), "a", d.run);
  d.engine.load(before.project);
  expect(d.controller.read()).toBeNull();
  expect(d.controller.finish("a")).toBe(false);
  expect(d.controller.begin(d.owner, before.project.pages[0]!, "a", d.run)).toBe(false);
});

it("explains unsupported animated reparenting while leaving same-parent ordering available", () => {
  const d = fixture();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({ type: "upsertMotionKeyframe", target: { kind: "layer", layerId: "a", property: "rotation" }, time: { value: 1, rate: 1 }, value: 20 });
  const before = d.engine.getSnapshot();
  d.controller.begin(d.owner, d.page(), "a", d.run);
  expect(d.controller.preview(d.page(), d.layer("group"), "before")).toBe(false);
  expect(d.controller.read()?.rejected).toEqual({ id: "group", reason: "animatedHierarchy" });
  expect(d.controller.read()?.target).toBeNull();
  expect(d.controller.finish("a")).toBe(false);
  expect(d.engine.getSnapshot()).toBe(before);
  d.controller.begin(d.owner, d.page(), "a", d.run);
  expect(d.controller.preview(d.page(), d.layer("b"), "before")).toBe(true);
  d.controller.cancel();
});

it("rejects locked owners, cross-composition targets and invalid graphs without publishing per-pixel state", () => {
  const d = fixture();
  d.engine.execute({ type: "addPage", page: createPage({ id: "other", layers: [createLayer("rectangle", { id: "foreign" })] }) });
  const source = d.page();
  d.engine.setPage(source.id);
  d.controller.begin(d.owner, source, "a", d.run);
  const other = d.engine.getSnapshot().project.pages[1]!;
  expect(d.controller.preview(other, other.layers[0]!, "before")).toBe(false);
  expect(d.controller.read()?.rejected?.reason).toBe("crossComposition");
  d.controller.clear();
  const clear = d.controller.read();
  d.controller.clear();
  expect(d.controller.read()).toBe(clear);
  d.engine.execute({ type: "updateLayers", ids: ["group"], patch: { locked: true } });
  expect(d.controller.read()).toBeNull();
  expect(d.controller.begin(d.owner, d.page(), "a", d.run)).toBe(false);
  expect(d.controller.begin(d.owner, d.page(), "missing", d.run)).toBe(false);
});

it("keeps an original insertion and an existing identical alpha mask out of history", () => {
  const d = fixture(), before = d.engine.getSnapshot();
  d.controller.begin(d.owner, d.page(), "a", d.run);
  d.controller.preview(d.page(), d.layer("b"), "after");
  expect(d.controller.finish("a")).toBe(false);
  expect(d.engine.getSnapshot()).toBe(before);
  d.controller.begin(d.owner, d.page(), "a", d.run);
  d.controller.preview(d.page(), d.layer("b"), "mask");
  expect(d.controller.finish("a")).toBe(true);
  const masked = d.engine.getSnapshot();
  d.controller.begin(d.owner, d.page(), "a", d.run);
  d.controller.preview(d.page(), d.layer("b"), "mask");
  expect(d.controller.finish("a")).toBe(false);
  expect(d.engine.getSnapshot()).toBe(masked);
});

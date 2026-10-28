import { expect, test, vi } from "vitest";
import { createEffect, createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import {
  attachmentSelection,
  capturePresentationDelete,
} from "../../../src/state/selection/attachments";
function fixture() {
  const effect = createEffect("dither", { id: "effect" }),
    owner = createLayer("rectangle", {
      id: "owner",
      effects: [effect, createEffect("contrast", { id: "other" })],
      mask: { layerId: "mask-source", enabled: true, inverted: false },
    }),
    source = createLayer("rectangle", { id: "mask-source", maskSource: true }),
    engine = new EditorEngine(
      createProject({ pages: [createPage({ id: "page", layers: [owner, source] })] }),
    ),
    page = engine.getSnapshot().project.pages[0]!,
    port = attachmentSelection(engine);
  engine.select([owner.id]);
  const select = () =>
    port.select(engine.getSnapshot().project.pages[0]!, {
      kind: "effect",
      pageId: page.id,
      layerId: owner.id,
      effectId: effect.id,
    });
  return { engine, port, page, owner, effect, select };
}
test("keeps effect selection outside portable layer IDs and removes only that effect in one undo", () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  const input = {
    kind: "effect" as const,
    pageId: d.page.id,
    layerId: d.owner.id,
    effectId: d.effect.id,
  };
  expect(d.port.select(d.page, input)).toBe(true);
  expect(d.port.read()).not.toBe(input);
  expect(Object.isFrozen(d.port.read())).toBe(true);
  input.effectId = "other";
  expect(d.port.read()).toHaveProperty("effectId", "effect");
  expect(d.engine.getSnapshot().selection).toEqual([d.owner.id]);
  expect(d.engine.getSnapshot().project).toBe(before);
  capturePresentationDelete(d.engine)();
  const after = d.engine.getSnapshot();
  expect(after.project.pages[0]!.layers.map((layer) => layer.id)).toEqual(["owner", "mask-source"]);
  expect(after.project.pages[0]!.layers[0]!.effects.map((effect) => effect.id)).toEqual(["other"]);
  expect(after.selection).toEqual([]);
  expect(d.port.read()).toBeNull();
  const revision = after.revision;
  capturePresentationDelete(d.engine)();
  expect(d.engine.getSnapshot().revision).toBe(revision);
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(before);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
test("mask removal preserves its owner and source and ordinary commits keep a valid attachment target", () => {
  const d = fixture();
  d.port.select(d.page, { kind: "mask", pageId: d.page.id, layerId: d.owner.id });
  d.engine.execute({ type: "updateMask", targetId: d.owner.id, patch: { inverted: true } });
  expect(d.port.editable()).toBe(true);
  const before = d.engine.getSnapshot().project;
  capturePresentationDelete(d.engine)();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(2);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.mask).toBeNull();
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(before);
});
test("stale, removed, replaced and locked attachment targets never fall back to deleting their owner", () => {
  const d = fixture();
  d.select();
  const deferred = capturePresentationDelete(d.engine);
  d.port.select(d.page, { kind: "mask", pageId: d.page.id, layerId: d.owner.id });
  deferred();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  d.select();
  d.engine.execute({ type: "updateLayers", ids: [d.owner.id], patch: { effects: [] } });
  expect(d.port.read()).toHaveProperty("kind", "effect");
  expect(d.port.editable()).toBe(false);
  const revision = d.engine.getSnapshot().revision;
  capturePresentationDelete(d.engine)();
  expect(d.engine.getSnapshot().revision).toBe(revision);
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(2);
  const other = fixture();
  other.select();
  const queued = capturePresentationDelete(other.engine);
  other.engine.load(structuredClone(other.engine.getSnapshot().project));
  other.engine.select([other.owner.id]);
  queued();
  expect(other.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(2);
  expect(other.engine.getSnapshot().canUndo).toBe(false);
  expect(
    other.port.select(other.page, {
      kind: "effect",
      pageId: other.page.id,
      layerId: other.owner.id,
      effectId: other.effect.id,
    }),
  ).toBe(false);
  capturePresentationDelete(other.engine)();
  expect(other.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(2);
  other.select();
  other.engine.execute({ type: "updateLayers", ids: [other.owner.id], patch: { locked: true } });
  const locked = other.engine.getSnapshot().revision;
  capturePresentationDelete(other.engine)();
  expect(other.engine.getSnapshot().revision).toBe(locked);
});
test("clearing attachment intent restores ordinary layer deletion and cleans owned subscriptions", () => {
  const d = fixture();
  d.select();
  d.port.clear();
  capturePresentationDelete(d.engine)();
  expect(d.engine.getSnapshot().project.pages[0]!.layers.map((layer) => layer.id)).toEqual([
    "mask-source",
  ]);
  const engine = new EditorEngine(),
    stopEngine = vi.fn(),
    stopSummary = vi.fn();
  vi.spyOn(engine, "subscribe").mockReturnValue(stopEngine);
  vi.spyOn(engine, "subscribeCommitInfo").mockReturnValue(stopSummary);
  const port = attachmentSelection(engine),
    stop = port.subscribe(vi.fn());
  expect(attachmentSelection(engine)).toBe(port);
  stop();
  expect(stopEngine).toHaveBeenCalledOnce();
  expect(stopSummary).toHaveBeenCalledOnce();
});

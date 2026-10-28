import { expect, test, vi } from "vitest";
import { EditorEngine, createLayer, createPage, createProject, createEffect } from "@musart/core";
import { attachmentSelection } from "../../../src/state/selection/attachments";
import { documentShortcut } from "../../../src/state/keybindings/document-actions";
test("runs the same document commands without a UI bridge and keeps directional commits atomic", async () => {
  const layer = createLayer("rectangle"),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    save = vi.fn(async () => {}),
    setTool = vi.fn();
  const context = { engine, save, setTool };
  expect(documentShortcut("action:settings", context)).toBeUndefined();
  await documentShortcut("action:save", context)!();
  expect(save).toHaveBeenCalledOnce();
  await documentShortcut("action:toolText", context)!();
  expect(setTool).toHaveBeenCalledExactlyOnceWith("text");
  await documentShortcut("action:delete", context)!();
  expect(engine.getSnapshot().canUndo).toBe(false);
  await documentShortcut("action:selectAll", context)!();
  expect(engine.getSnapshot().selection).toEqual([layer.id]);
  await documentShortcut("nudge:LeftLarge", context)!();
  await documentShortcut("nudge:Down", context)!();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]).toMatchObject({
    x: layer.x - 10,
    y: layer.y + 1,
  });
  await documentShortcut("action:undo", context)!();
  await documentShortcut("action:redo", context)!();
  await documentShortcut("action:duplicate", context)!();
  expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(2);
  await documentShortcut("action:selectAll", context)!();
  await documentShortcut("action:group", context)!();
  await documentShortcut("action:ungroup", context)!();
  expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(2);
  await documentShortcut("action:deselect", context)!();
  expect(engine.getSnapshot().selection).toEqual([]);
});
test("delete captures an effect target before a task is deferred and never deletes its owner", async () => {
  const effect = createEffect("dither"),
    layer = createLayer("rectangle", { effects: [effect] }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    page = engine.getSnapshot().project.pages[0]!,
    port = attachmentSelection(engine),
    context = { engine, save: vi.fn(async () => {}), setTool: vi.fn() };
  port.select(page, { kind: "effect", pageId: page.id, layerId: layer.id, effectId: effect.id });
  const stale = documentShortcut("action:delete", context)!;
  port.clear();
  await stale();
  expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(1);
  expect(engine.getSnapshot().canUndo).toBe(false);
  port.select(page, { kind: "effect", pageId: page.id, layerId: layer.id, effectId: effect.id });
  await documentShortcut("action:delete", context)!();
  expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(1);
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toHaveLength(0);
  engine.undo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toHaveLength(1);
  expect(engine.getSnapshot().canUndo).toBe(false);
});

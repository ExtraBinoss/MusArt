import { expect, test, vi } from "vitest";
import { createEffect, createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { attachmentSelection } from "../../../src/state/selection/attachments";
import { attachmentDeleteKey } from "../../../src/state/selection/attachment-keydown";
function fixture() {
  const effect = createEffect("dither"),
    layer = createLayer("rectangle", { effects: [effect] }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    page = engine.getSnapshot().project.pages[0]!;
  attachmentSelection(engine).select(page, {
    kind: "effect",
    pageId: page.id,
    layerId: layer.id,
    effectId: effect.id,
  });
  return { engine, layer };
}
test("configured delete in an attachment popover removes its effect while typing and repeats stay native", () => {
  const d = fixture(),
    run = vi.fn((task: () => void) => task()),
    button = document.createElement("button"),
    input = document.createElement("input");
  for (const element of [button, input])
    element.addEventListener("keydown", (event) => {
      if (event instanceof KeyboardEvent) attachmentDeleteKey(event, d.engine, run);
    });
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", cancelable: true }));
  button.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Delete", repeat: true, cancelable: true }),
  );
  expect(run).not.toHaveBeenCalled();
  const event = new KeyboardEvent("keydown", { key: "Delete", cancelable: true });
  button.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(1);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toHaveLength(0);
  expect(run).toHaveBeenCalledOnce();
});
test("a deferred popover deletion cannot delete a different attachment or owner", () => {
  const d = fixture();
  let pending!: () => void;
  attachmentDeleteKey(
    new KeyboardEvent("keydown", { key: "Delete", cancelable: true }),
    d.engine,
    (task) => {
      pending = task;
    },
  );
  attachmentSelection(d.engine).clear();
  pending();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(1);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { createEffect, createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { attachmentSelection } from "../../../src/state/selection/attachments";
import { useAttachmentSelection } from "../../../src/state/selection/use-attachment-selection";
test("subscribes to the typed presentation target without rewriting document selection", () => {
  const effect = createEffect("dither"),
    layer = createLayer("rectangle", { effects: [effect] }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    page = engine.getSnapshot().project.pages[0]!,
    port = attachmentSelection(engine),
    view = renderHook(() => useAttachmentSelection(engine));
  expect(view.result.current).toBeNull();
  act(() => {
    port.select(page, { kind: "effect", pageId: page.id, layerId: layer.id, effectId: effect.id });
  });
  expect(view.result.current).toHaveProperty("effectId", effect.id);
  expect(engine.getSnapshot().selection).toEqual([layer.id]);
  act(() => port.clear());
  expect(view.result.current).toBeNull();
  view.unmount();
});

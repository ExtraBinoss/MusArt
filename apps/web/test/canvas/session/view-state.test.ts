import { expect, test, vi } from "vitest";
import { createEffect, createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { createCanvasView } from "../../../src/canvas/session/view-state";
test("keeps a stable viewport snapshot for paint changes, while geometry, guides and selection remain reactive", () => {
  const layer = createLayer("rectangle");
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [layer] }), createPage()] }),
  );
  const view = createCanvasView(engine);
  const first = view.read();
  const notify = vi.fn();
  const stop = view.subscribe(notify);
  for (const patch of [
    { fill: "#123456" },
    { opacity: 0.25 },
    { effects: [createEffect("dither")] },
  ]) {
    engine.execute({ type: "updateLayers", ids: [layer.id], patch });
    expect(view.read()).toBe(first);
  }
  engine.execute({ type: "updatePage", patch: { background: "#abcdef" } });
  expect(view.read()).toBe(first);
  engine.select([layer.id]);
  const selected = view.read();
  expect(selected).not.toBe(first);
  engine.execute({ type: "updateLayers", ids: [layer.id], patch: { x: 90 } });
  expect(view.read()).not.toBe(selected);
  engine.execute({ type: "addGuide", guide: { id: "guide", axis: "x", position: 100 } });
  const guided = view.read();
  engine.setPage(engine.getSnapshot().project.pages[1]!.id);
  expect(view.read()).not.toBe(guided);
  expect(notify).toHaveBeenCalled();
  stop();
});
test("selection-only snapshots reuse immutable geometry without serializing all ten thousand layers", () => {
  const layers = Array.from({ length: 10000 }, (_, index) =>
    createLayer("rectangle", { id: `select-${index}` }),
  );
  const engine = new EditorEngine(createProject({ pages: [createPage({ layers })] })),
    view = createCanvasView(engine);
  const first = view.read();
  const serialize = vi.spyOn(JSON, "stringify");
  engine.select([layers[9999]!.id]);
  serialize.mockClear();
  const selected = view.read();
  expect(selected.selection).toEqual([layers[9999]!.id]);
  expect(selected.project).toBe(first.project);
  expect(serialize).not.toHaveBeenCalled();
  expect(view.read()).toBe(selected);
});

import { expect, test, vi } from "vitest";
import { createPage, createProject, EditorEngine } from "@musart/core";
import {
  requestCompositionExport,
  subscribeCompositionExport,
} from "../../../src/components/export/composition-request";
test("routes durable artboard IDs only inside their engine without changing editing state", () => {
  const a = createPage(),
    b = createPage(),
    engine = new EditorEngine(createProject({ pages: [a, b] }));
  const other = new EditorEngine(createProject()),
    listener = vi.fn(),
    foreign = vi.fn();
  const stop = subscribeCompositionExport(engine, listener),
    stopOther = subscribeCompositionExport(other, foreign);
  const before = engine.getSnapshot();
  requestCompositionExport(engine, b.id);
  expect(listener).toHaveBeenCalledWith({ projectId: before.project.id, compositionId: b.id });
  expect(foreign).not.toHaveBeenCalled();
  expect(engine.getSnapshot()).toBe(before);
  requestCompositionExport(engine, "deleted");
  expect(listener).toHaveBeenCalledOnce();
  stop();
  stopOther();
  requestCompositionExport(engine, a.id);
  expect(listener).toHaveBeenCalledOnce();
});

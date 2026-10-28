import { expect, it } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import {
  captureGestureOrigin,
  isGestureOriginCurrent,
} from "../../../src/canvas/interaction/gesture-origin";
it("permits selection but rejects replaced projects, pages and canonical revisions", () => {
  const layer = createLayer("rectangle"),
    a = createPage({ layers: [layer] }),
    b = createPage(),
    engine = new EditorEngine(createProject({ pages: [a, b] }));
  const origin = captureGestureOrigin(engine);
  engine.select([layer.id]);
  expect(isGestureOriginCurrent(engine, origin)).toBe(true);
  engine.setPage(b.id);
  expect(isGestureOriginCurrent(engine, origin)).toBe(false);
  engine.setPage(a.id);
  engine.execute({ type: "updateLayers", ids: [layer.id], patch: { fill: "#123456" } });
  expect(isGestureOriginCurrent(engine, origin)).toBe(false);
  const current = captureGestureOrigin(engine);
  engine.load(structuredClone(engine.getSnapshot().project));
  expect(isGestureOriginCurrent(engine, current)).toBe(false);
});

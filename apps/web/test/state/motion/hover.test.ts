import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { createTimelineHoverSource } from "../../../src/state/motion/hover";

function fixture() {
  const a = createLayer("rectangle", { id: "a" }),
    b = createLayer("rectangle", { id: "b" });
  const engine = new EditorEngine(
    createProject({
      pages: [createPage({ id: "first", layers: [a, b] }), createPage({ id: "second" })],
    }),
  );
  return { a, b, engine, hover: createTimelineHoverSource(engine) };
}
test("hover is one engine-scoped presentation lease without selection or history mutations", () => {
  const d = fixture(),
    before = d.engine.getSnapshot(),
    changed = vi.fn();
  expect(createTimelineHoverSource(d.engine)).toBe(d.hover);
  const stop = d.hover.subscribe(changed);
  const first = d.hover.show("first", d.a.id);
  expect(d.hover.read()).toEqual({
    projectId: before.project.id,
    compositionId: "first",
    layerId: "a",
  });
  const second = d.hover.show("first", d.b.id);
  first();
  expect(d.hover.read()?.layerId).toBe("b");
  expect(d.engine.getSnapshot()).toBe(before);
  expect(changed).toHaveBeenCalledTimes(2);
  second();
  second();
  expect(d.hover.read()).toBeNull();
  expect(changed).toHaveBeenCalledTimes(3);
  stop();
});
test("page switches, deletion and same-ID loads retire hover and cannot resurrect it", () => {
  const d = fixture();
  const old = d.hover.show("first", "a");
  d.engine.setPage("second");
  expect(d.hover.read()).toBeNull();
  d.engine.setPage("first");
  expect(d.hover.read()).toBeNull();
  d.hover.show("first", "a");
  d.engine.execute({ type: "deleteLayers", ids: ["a"] });
  expect(d.hover.read()).toBeNull();
  d.engine.undo();
  expect(d.hover.read()).toBeNull();
  d.hover.show("first", "a");
  d.engine.load(d.engine.getSnapshot().project);
  expect(d.hover.read()).toBeNull();
  const latest = d.hover.show("first", "b");
  old();
  expect(d.hover.read()?.layerId).toBe("b");
  latest();
});
test("unrelated edits keep the hovered identity, stale/foreign targets are refused, and producers release observation", () => {
  const d = fixture(),
    subscribe = d.engine.subscribe;
  let observations = 0;
  vi.spyOn(d.engine, "subscribe").mockImplementation((listener) => {
    observations++;
    const stop = subscribe(listener);
    return () => {
      observations--;
      stop();
    };
  });
  d.hover.show("second", "a")();
  d.hover.show("first", "missing")();
  expect(d.hover.read()).toBeNull();
  expect(observations).toBe(0);
  const clear = d.hover.show("first", "a");
  d.engine.execute({ type: "updateLayers", ids: ["a"], patch: { x: 42 } });
  expect(d.hover.read()?.layerId).toBe("a");
  expect(observations).toBe(1);
  clear();
  expect(observations).toBe(0);
});

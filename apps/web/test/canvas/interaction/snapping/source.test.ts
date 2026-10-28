import { expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine, type SnapCue } from "@musart/core";
import { SnapFeedback } from "../../../../src/canvas/interaction/snapping/source";
import { captureGestureOrigin } from "../../../../src/canvas/interaction/gesture-origin";
const cues: SnapCue[] = [
  {
    axis: "x",
    position: 100,
    from: { x: 100, y: 0 },
    to: { x: 100, y: 200 },
    targetId: "target",
    kind: "layer",
  },
];
it("publishes immutable gesture feedback without editing the engine and cleans subscriptions", () => {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [createLayer("rectangle")] })] }),
  );
  const feedback = new SnapFeedback(engine),
    origin = captureGestureOrigin(engine),
    empty = feedback.read(),
    listener = vi.fn(),
    stop = feedback.subscribe(listener);
  feedback.clear();
  expect(listener).not.toHaveBeenCalled();
  feedback.set(origin, cues);
  expect(feedback.read().cues).toEqual(cues);
  expect(feedback.read().cues).not.toBe(cues);
  expect(Object.isFrozen(feedback.read().origin)).toBe(true);
  expect(Object.isFrozen(feedback.read().cues)).toBe(true);
  expect(engine.getSnapshot().project).toBe(origin.project);
  feedback.set(origin, []);
  expect(feedback.read()).toBe(empty);
  stop();
  feedback.set(origin, cues);
  expect(listener).toHaveBeenCalledTimes(2);
});
it("rejects stale page/project/revision feedback and supports a standalone presentation source", () => {
  const first = createPage(),
    second = createPage(),
    engine = new EditorEngine(createProject({ pages: [first, second] }));
  const feedback = new SnapFeedback(engine),
    origin = captureGestureOrigin(engine);
  feedback.set(origin, cues);
  engine.setPage(second.id);
  feedback.set(origin, cues);
  expect(feedback.read().cues).toEqual([]);
  const next = captureGestureOrigin(engine);
  engine.execute({ type: "renameProject", name: "Changed" });
  feedback.set(next, cues);
  expect(feedback.read().origin).toBeNull();
  const standalone = new SnapFeedback();
  standalone.set(origin, cues);
  expect(standalone.read().origin).toEqual(origin);
});

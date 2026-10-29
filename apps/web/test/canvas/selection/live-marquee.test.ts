import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { createLiveMarquee } from "../../../src/canvas/selection/live-marquee";

function fixture() {
  const a = createLayer("rectangle", { id: "a", x: 10, y: 10, width: 20, height: 20 });
  const b = createLayer("rectangle", { id: "b", x: 70, y: 10, width: 20, height: 20 });
  const project = createProject({ pages: [createPage({ layers: [a, b] })] });
  const engine = new EditorEngine(project),
    tasks = new Map<number, () => void>();
  let sequence = 0;
  const cancel = vi.fn((id: number) => tasks.delete(id));
  const live = createLiveMarquee(engine, {
    request: (fn) => {
      tasks.set(++sequence, fn);
      return sequence;
    },
    cancel,
  });
  const frame = () => {
    const queued = [...tasks.values()];
    tasks.clear();
    queued.forEach((fn) => fn());
  };
  const scope = { initial: [] as string[], additive: false, intersect: false };
  return { engine, project, tasks, live, frame, scope, cancel };
}
test("held boxes coalesce to one real selection per frame, shrink, and flush their release without history", () => {
  const d = fixture(),
    original = d.engine.getSnapshot().project;
  const notify = vi.fn();
  d.engine.subscribe(notify);
  d.live.queue({ x: 0, y: 0 }, { x: 45, y: 45 }, d.scope);
  d.live.queue({ x: 0, y: 0 }, { x: 100, y: 45 }, d.scope);
  expect(d.tasks.size).toBe(1);
  expect(d.engine.getSnapshot().selection).toEqual([]);
  d.frame();
  expect(d.engine.getSnapshot().selection).toEqual(["a", "b"]);
  expect(notify).toHaveBeenCalledOnce();
  d.live.queue({ x: 0, y: 0 }, { x: 45, y: 45 }, d.scope);
  d.frame();
  expect(d.engine.getSnapshot().selection).toEqual(["a"]);
  d.live.queue({ x: 0, y: 0 }, { x: 100, y: 45 }, d.scope);
  d.live.commit();
  expect(d.tasks.size).toBe(0);
  expect(d.engine.getSnapshot().selection).toEqual(["a", "b"]);
  expect(d.engine.getSnapshot()).toMatchObject({ project: original, revision: 0, canUndo: false });
});
test("additive intersections preserve initial IDs and cancellation restores only its own selection", () => {
  const d = fixture();
  d.engine.select(["b"]);
  const scope = { initial: ["b"], additive: true, intersect: true };
  d.live.queue({ x: 5, y: 5 }, { x: 15, y: 15 }, scope);
  d.frame();
  expect(d.engine.getSnapshot().selection).toEqual(["b", "a"]);
  d.live.cancel();
  expect(d.engine.getSnapshot().selection).toEqual(["b"]);
  d.live.queue({ x: 5, y: 5 }, { x: 15, y: 15 }, scope);
  d.frame();
  d.engine.select([]);
  d.live.cancel();
  expect(d.engine.getSnapshot().selection).toEqual([]);
});
test("discarded, changed and replaced documents reject queued selection work", () => {
  const d = fixture();
  d.live.queue({ x: 0, y: 0 }, { x: 100, y: 45 }, d.scope);
  const old = [...d.tasks.values()][0]!;
  d.live.discard();
  old();
  expect(d.engine.getSnapshot().selection).toEqual([]);
  d.live.queue({ x: 0, y: 0 }, { x: 100, y: 45 }, d.scope);
  d.engine.execute({ type: "updatePage", patch: { rulers: true } });
  d.frame();
  d.live.cancel();
  expect(d.engine.getSnapshot().selection).toEqual([]);
  d.live.queue({ x: 0, y: 0 }, { x: 100, y: 45 }, d.scope);
  d.engine.load(d.project);
  d.frame();
  d.live.cancel();
  expect(d.engine.getSnapshot().selection).toEqual([]);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

test("queued and reentrant publications never replace another selection owner", () => {
  const d = fixture();
  d.live.queue({ x: 0, y: 0 }, { x: 100, y: 45 }, d.scope);
  d.engine.select(["b"]);
  d.frame();
  expect(d.engine.getSnapshot().selection).toEqual(["b"]);
  d.live.cancel();
  expect(d.engine.getSnapshot().selection).toEqual(["b"]);
  const stop = d.engine.subscribe(() => {
    if (d.engine.getSnapshot().selection.length === 2) d.engine.select(["a"]);
  });
  d.live.queue({ x: 0, y: 0 }, { x: 100, y: 45 }, { ...d.scope, initial: ["b"] });
  d.frame();
  d.live.cancel();
  expect(d.engine.getSnapshot().selection).toEqual(["a"]);
  stop();
});

import { expect, test, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { captureGestureOrigin } from "../../../src/canvas/interaction/gesture-origin";
import { prepareMarqueePage, type MarqueeScope } from "../../../src/canvas/selection/marquee-scope";
import { intersectingMarquee } from "../../../src/canvas/selection/marquee-scope";

test("constructs secondary selection scope without activating another page", () => {
  const a = createPage(),
    b = createPage();
  const engine = new EditorEngine(createProject({ pages: [a, b] }));
  const before = engine.getSnapshot();
  expect(intersectingMarquee(engine, false)).toEqual({
    initial: [],
    additive: false,
    intersect: true,
  });
  expect(intersectingMarquee(engine, true, a.id)).toEqual({
    initial: [],
    additive: true,
    intersect: true,
  });
  expect(intersectingMarquee(engine, false, b.id)).toEqual({
    initial: [],
    additive: false,
    intersect: true,
    pageId: b.id,
  });
  expect(engine.getSnapshot()).toBe(before);
});

test("keeps stationary secondary clicks inert and rebases only a dragged destination in its new page scope", () => {
  const a = createPage(),
    b = createPage();
  const engine = new EditorEngine(createProject({ pages: [a, b] }));
  const active: MarqueeScope = {
    origin: captureGestureOrigin(engine),
    from: { x: 1, y: 2 },
    client: { x: 10, y: 20 },
    boxSelection: { initial: [], additive: true, intersect: true, pageId: b.id },
  };
  const gesture: { current: MarqueeScope | null } = { current: active };
  const point = vi.fn(() => ({ x: 5, y: 7 })),
    before = engine.getSnapshot();
  expect(prepareMarqueePage(engine, gesture, { clientX: 11, clientY: 21 }, point)).toBe(true);
  expect(engine.getSnapshot()).toBe(before);
  expect(point).not.toHaveBeenCalled();
  const observations: unknown[] = [];
  const stop = engine.subscribe(() => observations.push(gesture.current));
  expect(prepareMarqueePage(engine, gesture, { clientX: 30, clientY: 50 }, point)).toBe(true);
  expect(observations).toEqual([null]);
  expect(engine.getSnapshot().pageId).toBe(b.id);
  expect(gesture.current).toBe(active);
  expect(active.origin).toEqual(captureGestureOrigin(engine));
  expect(active.from).toEqual({ x: 5, y: 7 });
  expect(active.boxSelection?.pageId).toBeUndefined();
  expect(active.boxSelection?.initial).toEqual([]);
  expect(point).toHaveBeenCalledExactlyOnceWith({ clientX: 10, clientY: 20 });
  expect(prepareMarqueePage(engine, gesture, { clientX: 50, clientY: 70 }, point)).toBe(true);
  expect(point).toHaveBeenCalledOnce();
  gesture.current = null;
  expect(prepareMarqueePage(engine, gesture, { clientX: 50, clientY: 70 }, point)).toBe(false);
  gesture.current = { ...active, boxSelection: undefined };
  expect(prepareMarqueePage(engine, gesture, { clientX: 50, clientY: 70 }, point)).toBe(true);
  expect(point).toHaveBeenCalledOnce();
  stop();
});

function destination() {
  const a = createPage(),
    b = createPage({ layers: [createLayer("rectangle", { id: "destination-layer" })] }),
    engine = new EditorEngine(createProject({ pages: [a, b] }));
  const active: MarqueeScope = {
    origin: captureGestureOrigin(engine),
    from: { x: 1, y: 2 },
    client: { x: 10, y: 20 },
    boxSelection: { initial: [], additive: false, intersect: true, pageId: b.id },
  };
  const gesture: { current: MarqueeScope | null } = { current: active };
  const point = vi.fn(() => ({ x: 5, y: 7 }));
  return { engine, a, b, active, gesture, point };
}

test.each(["load", "edit", "redirect", "select"] as const)(
  "rejects a reentrant %s during destination activation without adopting its origin or selection",
  (operation) => {
    const d = destination(),
      origin = d.active.origin,
      from = d.active.from;
    let changed = false,
      expected = d.engine.getSnapshot();
    const stop = d.engine.subscribe(() => {
      if (changed || d.engine.getSnapshot().pageId !== d.b.id) return;
      changed = true;
      if (operation === "load") {
        d.engine.load(d.engine.getSnapshot().project);
        d.engine.setPage(d.b.id);
      } else if (operation === "edit")
        d.engine.execute({ type: "updatePage", patch: { rulers: true } });
      else if (operation === "redirect") d.engine.setPage(d.a.id);
      else d.engine.select(["destination-layer"]);
      expected = d.engine.getSnapshot();
    });
    expect(prepareMarqueePage(d.engine, d.gesture, { clientX: 30, clientY: 50 }, d.point)).toBe(
      false,
    );
    expect(changed).toBe(true);
    expect(d.gesture.current).toBeNull();
    expect(d.point).not.toHaveBeenCalled();
    expect(d.active.origin).toBe(origin);
    expect(d.active.from).toBe(from);
    expect(d.active.boxSelection?.pageId).toBe(d.b.id);
    expect(d.engine.getSnapshot()).toBe(expected);
    stop();
  },
);

test("rejects stale origins and missing destinations before publishing a page change", () => {
  const d = destination();
  d.engine.execute({ type: "updatePage", patch: { rulers: true } });
  const snapshot = d.engine.getSnapshot();
  expect(prepareMarqueePage(d.engine, d.gesture, { clientX: 30, clientY: 50 }, d.point)).toBe(
    false,
  );
  expect(d.gesture.current).toBeNull();
  expect(d.engine.getSnapshot()).toBe(snapshot);
  d.gesture.current = {
    ...d.active,
    origin: captureGestureOrigin(d.engine),
    boxSelection: { initial: [], additive: false, intersect: true, pageId: "deleted-page" },
  };
  expect(prepareMarqueePage(d.engine, d.gesture, { clientX: 30, clientY: 50 }, d.point)).toBe(
    false,
  );
  expect(d.gesture.current).toBeNull();
  expect(d.engine.getSnapshot()).toBe(snapshot);
  expect(d.point).not.toHaveBeenCalled();
});

test("does not restore a gesture invalidated while rebasing destination coordinates", () => {
  const d = destination(),
    origin = d.active.origin;
  const point = () => {
    d.engine.execute({ type: "updatePage", patch: { rulers: true } });
    return { x: 5, y: 7 };
  };
  expect(prepareMarqueePage(d.engine, d.gesture, { clientX: 30, clientY: 50 }, point)).toBe(false);
  expect(d.gesture.current).toBeNull();
  expect(d.active.origin).toBe(origin);
  expect(d.active.boxSelection?.pageId).toBe(d.b.id);
});

import { expect, test, vi } from "vitest";
import { createPage, createProject, EditorEngine } from "@musart/core";
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
  prepareMarqueePage(engine, gesture, { clientX: 11, clientY: 21 }, point);
  expect(engine.getSnapshot()).toBe(before);
  expect(point).not.toHaveBeenCalled();
  const observations: unknown[] = [];
  const stop = engine.subscribe(() => observations.push(gesture.current));
  prepareMarqueePage(engine, gesture, { clientX: 30, clientY: 50 }, point);
  expect(observations).toEqual([null]);
  expect(engine.getSnapshot().pageId).toBe(b.id);
  expect(gesture.current).toBe(active);
  expect(active.origin).toEqual(captureGestureOrigin(engine));
  expect(active.from).toEqual({ x: 5, y: 7 });
  expect(active.boxSelection?.pageId).toBeUndefined();
  expect(active.boxSelection?.initial).toEqual([]);
  expect(point).toHaveBeenCalledExactlyOnceWith({ clientX: 10, clientY: 20 });
  prepareMarqueePage(engine, gesture, { clientX: 50, clientY: 70 }, point);
  expect(point).toHaveBeenCalledOnce();
  gesture.current = null;
  prepareMarqueePage(engine, gesture, { clientX: 50, clientY: 70 }, point);
  gesture.current = { ...active, boxSelection: undefined };
  prepareMarqueePage(engine, gesture, { clientX: 50, clientY: 70 }, point);
  expect(point).toHaveBeenCalledOnce();
  stop();
});

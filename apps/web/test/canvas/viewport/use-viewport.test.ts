import { createElement, StrictMode, useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createPage, createProject, EditorEngine } from "@musart/core";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { createWorkspace } from "../../../src/canvas/artboards/workspace";
import { useViewport } from "../../../src/canvas/viewport/use-viewport";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function fixture() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let time = 0,
    next = 1;
  const frames = new Map<number, FrameRequestCallback>(),
    changes = new Set<() => void>();
  const media = {
    matches: false,
    addEventListener: (_type: string, listener: () => void) => changes.add(listener),
    removeEventListener: (_type: string, listener: () => void) => changes.delete(listener),
  };
  vi.spyOn(window, "matchMedia").mockReturnValue(media as unknown as MediaQueryList);
  vi.spyOn(performance, "now").mockImplementation(() => time);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = next++;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 800,
  } as DOMRect);
  const page = createPage({ width: 200, height: 160 }),
    engine = new EditorEngine(createProject({ pages: [page] })),
    controller = new SceneController(engine, EMPTY_PREVIEW_SOURCE);
  const workspace = createWorkspace(engine, controller);
  let current: ReturnType<typeof useViewport>,
    renders = 0;
  function Probe() {
    const viewport = useRef<HTMLDivElement>(null);
    current = useViewport({
      engine,
      workspace,
      viewport,
      layoutKey: page.id,
      projectId: engine.getSnapshot().project.id,
    });
    renders++;
    return createElement(
      "div",
      { ref: viewport, "data-testid": "viewport" },
      createElement("span", null, current.view.zoom),
    );
  }
  const advance = (to: number) => {
    act(() => {
      time = to;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(time));
    });
  };
  return {
    Probe,
    engine,
    media,
    changes,
    frames,
    advance,
    read: () => current!,
    renders: () => renders,
  };
}
it("keeps animation frames imperative, retargets through the real wheel listener and publishes one settled React pose", () => {
  const d = fixture(),
    baseline = d.engine.getSnapshot();
  const { unmount } = render(createElement(d.Probe));
  d.advance(0);
  const initialRenders = d.renders();
  fireEvent.wheel(screen.getByTestId("viewport"), {
    ctrlKey: true,
    deltaY: -40,
    clientX: 600,
    clientY: 450,
  });
  d.advance(40);
  d.advance(80);
  d.advance(120);
  expect(d.read().motion.read().zoom).toBeGreaterThan(1);
  expect(d.renders()).toBe(initialRenders);
  d.advance(160);
  expect(d.renders()).toBe(initialRenders + 1);
  expect(d.read().view.zoom).toBeCloseTo(Math.exp(0.08));
  expect(d.engine.getSnapshot()).toBe(baseline);
  fireEvent.wheel(screen.getByTestId("viewport"), { deltaX: 30, deltaY: 20 });
  expect(d.read().motion.read().x).toBeCloseTo(d.read().view.x - 15);
  expect(d.read().viewRef.current).toBe(d.read().motion.read());
  fireEvent.wheel(screen.getByTestId("viewport"), { deltaY: 20, shiftKey: true });
  const before = d.read().motion.read().x;
  fireEvent.wheel(screen.getByTestId("viewport"), { deltaX: 10, deltaY: -20, shiftKey: true });
  expect(d.read().motion.read().x).toBe(before - 5);
  fireEvent.wheel(screen.getByTestId("viewport"), {
    metaKey: true,
    deltaY: -40,
    clientX: 500,
    clientY: 400,
  });
  expect(d.frames.size).toBeGreaterThan(0);
  unmount();
  expect(d.frames.size).toBe(0);
  expect(d.changes.size).toBe(0);
  expect(d.read().actions.run("reset")).toBe(false);
});
it("supports reduced-motion changes, exact presentation commands and StrictMode lifecycle cleanup", () => {
  const d = fixture(),
    { unmount } = render(createElement(StrictMode, null, createElement(d.Probe)));
  d.advance(0);
  act(() => {
    d.read().actions.run("zoomIn");
  });
  d.advance(160);
  expect(d.read().view.zoom).toBe(1.2);
  act(() => {
    d.read().actions.run("zoomOut");
    d.media.matches = true;
    d.changes.forEach((listener) => listener());
  });
  expect(d.read().view.zoom).toBeCloseTo(1);
  act(() => {
    d.read().actions.run("reset");
    d.read().actions.run("fit");
    d.read().actions.run("recenter");
  });
  expect(d.read().view).toEqual({ x: 0, y: 0, zoom: 1 });
  unmount();
  expect(d.changes.size).toBe(0);
  expect(d.frames.size).toBe(0);
});
it("keeps repeated pan events imperative, commits after quiet and cancels pending settlement on pointerdown/unmount", () => {
  const d = fixture(),
    { unmount } = render(createElement(d.Probe));
  d.advance(0);
  const baseline = d.renders();
  for (let index = 0; index < 20; index++)
    fireEvent.wheel(screen.getByTestId("viewport"), { deltaX: 2, deltaY: 3 });
  expect(d.renders()).toBe(baseline);
  expect(d.read().motion.read()).toEqual({ x: -20, y: -30, zoom: 1 });
  expect(d.read().view).toEqual({ x: 0, y: 0, zoom: 1 });
  act(() => {
    vi.advanceTimersByTime(100);
  });
  expect(d.renders()).toBe(baseline + 1);
  expect(d.read().view).toEqual(d.read().motion.read());
  fireEvent.wheel(screen.getByTestId("viewport"), { deltaX: 2, deltaY: 3 });
  fireEvent.pointerDown(screen.getByTestId("viewport"));
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.wheel(screen.getByTestId("viewport"), { deltaX: 2, deltaY: 3 });
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

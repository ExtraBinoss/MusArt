import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { EditorCanvas } from "../../src/canvas/EditorCanvas";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import { snappingPreferences } from "../../src/state/snapping/preferences";
import type { SceneController } from "../../src/canvas/session/scene-controller";
const scene = vi.hoisted(() => ({ controller: null as SceneController | null }));
vi.mock("../../src/canvas/render/EditorScene", () => ({
  EditorScene: ({ controller }: { controller: SceneController }) => {
    useEffect(() => {
      scene.controller = controller;
      return controller.subscribe(() => {});
    }, [controller]);
    return <div data-testid="snap-scene" />;
  },
}));
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));
beforeEach(() => {
  snappingPreferences.update({ enabled: true, threshold: 6 });
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 800,
    right: 1000,
    bottom: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  cleanup();
  snappingPreferences.reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const point = (x: number, y: number, altKey = false) => ({
  clientX: 400 + x,
  clientY: 320 + y,
  pointerId: 1,
  button: 0,
  altKey,
});
async function fixture() {
  const moving = createLayer("rectangle", { id: "moving", x: 10, y: 10, width: 20, height: 20 }),
    target = createLayer("rectangle", { id: "target", x: 100, y: 80, width: 20, height: 20 });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ width: 200, height: 160, layers: [moving, target] })] }),
  );
  render(
    <TooltipProvider>
      <EditorCanvas engine={engine} tool="pointer" />
    </TooltipProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("snap-scene")).toBeInTheDocument());
  return { engine, canvas: screen.getByTestId("editor-canvas") };
}
it("snaps a real canvas gesture imperatively, clears cues on release and commits exactly one undo entry", async () => {
  const { engine, canvas } = await fixture(),
    before = engine.getSnapshot().project;
  fireEvent.pointerDown(canvas, point(20, 20));
  fireEvent.pointerMove(canvas, point(87, 20));
  expect(scene.controller!.read().page.layers[0]!.x).toBe(80);
  expect(engine.getSnapshot().project).toBe(before);
  expect(document.querySelector('[data-snap-axis="x"]')).not.toBeNull();
  fireEvent.pointerUp(canvas, point(87, 20));
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(80);
  expect(document.querySelector(".canvas-snap-line")).toBeNull();
  act(() => engine.undo());
  expect(engine.getSnapshot().project).toBe(before);
  expect(engine.getSnapshot().canUndo).toBe(false);
});
it("updates current preview when preferences change, supports Alt bypass and cancels stale page origins", async () => {
  const { engine, canvas } = await fixture();
  fireEvent.pointerDown(canvas, point(20, 20));
  fireEvent.pointerMove(canvas, point(87, 20));
  expect(scene.controller!.read().page.layers[0]!.x).toBe(80);
  act(() => {
    snappingPreferences.update({ enabled: false });
  });
  expect(scene.controller!.read().page.layers[0]!.x).toBe(77);
  expect(document.querySelector(".canvas-snap-line")).toBeNull();
  act(() => {
    snappingPreferences.update({ enabled: true });
  });
  expect(scene.controller!.read().page.layers[0]!.x).toBe(80);
  fireEvent.pointerMove(canvas, point(87, 20, true));
  expect(scene.controller!.read().page.layers[0]!.x).toBe(77);
  act(() =>
    engine.load(createProject({ pages: [createPage({ width: 200, height: 160, layers: [] })] })),
  );
  fireEvent.pointerUp(canvas, point(87, 20));
  expect(engine.getSnapshot().project.pages[0]!.layers).toEqual([]);
  expect(document.querySelector(".canvas-snap-line")).toBeNull();
});
it("resizes through a real handle to a manual guide and cancels without leaving snapped preview", async () => {
  const { engine, canvas } = await fixture();
  act(() => {
    engine.execute({ type: "addGuide", guide: { id: "resize-guide", axis: "x", position: 65 } });
    engine.select(["moving"]);
  });
  const handle = document.querySelector('[data-handle="se"]')!;
  fireEvent.pointerDown(handle, point(30, 30));
  fireEvent.pointerMove(canvas, point(62, 43));
  expect(scene.controller!.read().page.layers[0]!.width).toBe(55);
  expect(document.querySelector('[data-snap-target="resize-guide"]')).not.toBeNull();
  fireEvent.pointerCancel(canvas, point(62, 43));
  expect(scene.controller!.read().page.layers[0]!.width).toBe(20);
  expect(document.querySelector(".canvas-snap-line")).toBeNull();
});

it("re-evaluates late release modifiers and Alt key transitions without requiring a pointer move", async () => {
  const { engine, canvas } = await fixture();
  fireEvent.pointerDown(canvas, point(20, 20));
  fireEvent.pointerMove(canvas, point(87, 20));
  expect(scene.controller!.read().page.layers[0]!.x).toBe(80);
  fireEvent.keyDown(window, { key: "Alt", altKey: true });
  expect(scene.controller!.read().page.layers[0]!.x).toBe(77);
  fireEvent.keyUp(window, { key: "Alt", altKey: false });
  expect(scene.controller!.read().page.layers[0]!.x).toBe(80);
  fireEvent.pointerUp(canvas, point(87, 20, true));
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(77);
  act(() => engine.undo());
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(10);
});

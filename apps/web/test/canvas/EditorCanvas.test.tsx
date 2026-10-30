import { TooltipProvider } from "../../src/components/ui/tooltip";
import type { ReactNode } from "react";
import type { RenderOptions } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { createStore } from "jotai";
import { createPreviewSource } from "../../src/state/session/preview-source";
import { previewAtom } from "../../src/state/session/editor";
import type { SceneController } from "../../src/canvas/session/scene-controller";
import {
  act,
  cleanup,
  fireEvent,
  render as renderBase,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine, type Layer } from "@musart/core";
import { EditorCanvas } from "../../src/canvas/EditorCanvas";
import { createViewportActions } from "../../src/canvas/session/viewport-actions";
import { canvasPoint as point, pointerDrag } from "../support/canvas-pointer";
import { fileDragEvent } from "../support/file-drag";
const renderer = vi.hoisted(() => ({
  render: vi.fn(),
  controller: null as SceneController | null,
}));
const render = (node: ReactNode, options?: RenderOptions) =>
  renderBase(node, {
    ...options,
    wrapper: ({ children }) => <TooltipProvider>{children}</TooltipProvider>,
  });
vi.mock("../../src/canvas/render/EditorScene", () => ({
  EditorScene: ({
    controller,
    onError,
  }: {
    controller: SceneController;
    onError?: (message: string) => void;
  }) => {
    const element = useRef<HTMLDivElement>(null);
    useEffect(() => {
      renderer.controller = controller;
      const update = () => {
        const { page } = controller.read();
        renderer.render(page);
        if (element.current) element.current.dataset.width = String(page.width);
      };
      const stop = controller.subscribe(update);
      update();
      return stop;
    }, [controller]);
    return (
      <div ref={element} data-testid="scene-source">
        <button onClick={() => onError?.("GPU inaccessible")}>GPU error</button>
      </div>
    );
  },
}));
vi.mock("react-i18next", async (original) => ({
  ...(await original<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

const rectangle = () => createLayer("rectangle", { x: 20, y: 20, width: 60, height: 50 });
function setup(layers: Layer[] = [rectangle()]) {
  const page = createPage({ width: 200, height: 160, layers });
  const engine = new EditorEngine(createProject({ pages: [page] }));
  return { page, engine };
}
async function ready() {
  await waitFor(() => expect(screen.getByTestId("scene-source")).toBeInTheDocument());
}
function canvas() {
  return screen.getByTestId("editor-canvas");
}
function artboard() {
  return screen.getByTestId("artboard");
}

it("releases the transient frame before publishing a canonical move and keeps one undo entry", async () => {
  const { engine } = setup();
  const before = engine.getSnapshot().project;
  const frames: boolean[] = [];
  const stop = engine.subscribe(() => {
    const snapshot = engine.getSnapshot();
    if (snapshot.project !== before && renderer.controller)
      frames.push(renderer.controller.read().page === snapshot.project.pages[0]);
  });
  render(<EditorCanvas engine={engine} tool="pointer" />);
  expect(document.querySelector(".canvas-help")).toBeNull();
  await ready();
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  pointerDrag(canvas(), point(40, 40), point(70, 80), { altKey: true });
  expect(canvas()).toHaveFocus();
  input.remove();
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.every(Boolean)).toBe(true);
  expect(engine.getSnapshot().project.pages[0]!.layers[0]).toMatchObject({ x: 50, y: 60 });
  act(() => engine.undo());
  expect(engine.getSnapshot().project).toBe(before);
  expect(engine.getSnapshot().canUndo).toBe(false);
  stop();
});
beforeEach(() => {
  renderer.render.mockReset();
  renderer.controller = null;
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
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("canvas input and renderer integration", () => {
  it.each(["pointer", "rectangle", "text"] as const)(
    "cancels stale %s previews when the project/page changes before release",
    async (tool) => {
      const a = createPage({ width: 200, height: 160, layers: [rectangle()] }),
        b = createPage({ width: 200, height: 160 }),
        engine = new EditorEngine(createProject({ pages: [a, b] }));
      render(<EditorCanvas engine={engine} tool={tool} />);
      await ready();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const start = { clientX: 276, clientY: 360, pointerId: 1, button: 0 },
        end = { ...start, clientX: 306, clientY: 380 };
      fireEvent.pointerDown(canvas(), start);
      fireEvent.pointerMove(canvas(), { ...end, altKey: true });
      const replacement = structuredClone(engine.getSnapshot().project);
      replacement.id = "replacement";
      act(() => engine.load(replacement));
      const replaced = engine.getSnapshot();
      fireEvent.pointerUp(canvas(), end);
      expect(engine.getSnapshot()).toBe(replaced);
      expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(1);
      expect(engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(20);
      fireEvent.pointerDown(canvas(), start);
      fireEvent.pointerMove(canvas(), { ...end, altKey: true });
      act(() => engine.setPage(b.id));
      const switched = engine.getSnapshot();
      fireEvent.pointerUp(canvas(), end);
      expect(engine.getSnapshot()).toBe(switched);
      expect(engine.getSnapshot().project.pages[1]!.layers).toHaveLength(0);
      act(() => engine.setPage(a.id));
      fireEvent.pointerDown(canvas(), start);
      fireEvent.pointerMove(canvas(), { ...end, altKey: true });
      act(() => engine.execute({ type: "updatePage", patch: { name: "Concurrent" } }));
      const edited = engine.getSnapshot();
      fireEvent.pointerUp(canvas(), end);
      expect(engine.getSnapshot()).toBe(edited);
    },
  );
  it("shares one scene between artboards, preserves the world view and edits in active-page coordinates", async () => {
    const a = createPage({ name: "Cover", width: 200, height: 160, layers: [rectangle()] }),
      b = createPage({ name: "Story", width: 200, height: 160, layers: [rectangle()] }),
      engine = new EditorEngine(createProject({ pages: [a, b] }));
    const drop = vi.fn();
    render(<EditorCanvas engine={engine} tool="pointer" onDropFiles={drop} />);
    await ready();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const scene = screen.getByTestId("scene-source");
    expect(document.querySelectorAll(".canvas-artboard-backdrop")).toHaveLength(2);
    fireEvent.wheel(canvas(), { deltaX: 40, deltaY: 20 });
    const pose = [artboard().dataset.panX, artboard().dataset.panY, artboard().dataset.zoom];
    fireEvent.pointerDown(canvas(), { clientX: 584, clientY: 350, pointerId: 1, button: 0 });
    fireEvent.pointerUp(canvas(), { clientX: 584, clientY: 350, pointerId: 1, button: 0 });
    expect(engine.getSnapshot().pageId).toBe(b.id);
    expect(engine.getSnapshot().selection).toEqual([b.layers[0]!.id]);
    expect(screen.getByTestId("scene-source")).toBe(scene);
    expect([artboard().dataset.panX, artboard().dataset.panY, artboard().dataset.zoom]).toEqual(
      pose,
    );
    expect(artboard()).toHaveAttribute("data-artboard-id", b.id);
    pointerDrag(
      canvas(),
      { clientX: 584, clientY: 350, pointerId: 1, button: 0 },
      { clientX: 614, clientY: 370, pointerId: 1, button: 0 },
      { altKey: true },
    );
    expect(engine.getSnapshot().project.pages[1]!.layers[0]).toEqual(
      expect.objectContaining({ x: 50, y: 40 }),
    );
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(20);
    act(() => engine.undo());
    expect(engine.getSnapshot().project.pages[1]!.layers[0]!.x).toBe(20);
    const droppedFile = new File(["image"], "image.png", { type: "image/png" });
    const dropEvent = fileDragEvent("drop", { clientX: 260, clientY: 350, files: [droppedFile] });
    fireEvent(canvas(), dropEvent);
    expect(engine.getSnapshot().pageId).toBe(a.id);
    expect(drop).toHaveBeenCalledWith([droppedFile]);
  });
  it("pans on normal trackpad, zooms only with Ctrl/Cmd, and recenters at 100%", async () => {
    const { engine } = setup();
    render(<EditorCanvas engine={engine} tool="pointer" />);
    await ready();
    fireEvent.wheel(canvas(), { deltaX: 240, deltaY: 200 });
    expect(artboard()).toHaveAttribute("data-zoom", "1");
    expect(artboard()).toHaveAttribute("data-pan-x", "-120");
    fireEvent.click(await screen.findByRole("button", { name: "100 % et recentrer" }));
    expect(artboard()).toHaveAttribute("data-pan-y", "0");
    fireEvent.wheel(canvas(), { deltaY: -30, ctrlKey: true, clientX: 500, clientY: 400 });
    expect(Number(artboard().dataset.zoom)).toBeGreaterThan(1);
    fireEvent.wheel(canvas(), { deltaY: 50, metaKey: true, clientX: 500, clientY: 400 });
    fireEvent.click(screen.getByRole("button", { name: "100 % et recentrer" }));
    expect(artboard()).toHaveAttribute("data-zoom", "1");
    fireEvent.click(screen.getByRole("button", { name: "Zoomer" }));
    expect(artboard()).toHaveAttribute("data-zoom", "1.2");
    fireEvent.click(screen.getByRole("button", { name: "Dézoomer" }));
    expect(Number(artboard().dataset.zoom)).toBeCloseTo(1);
    fireEvent.wheel(canvas(), { deltaY: 10, shiftKey: true });
    expect(artboard()).toHaveAttribute("data-pan-x", "-5");
    act(() => {
      createViewportActions(engine).run("fit");
    });
    expect(artboard()).toHaveAttribute("data-pan-x", "0");
  });
  it("limits wheel and hand travel and shares presentation actions with command search", async () => {
    const { engine } = setup(),
      actions = createViewportActions(engine),
      baseline = engine.getSnapshot();
    const { unmount } = render(<EditorCanvas engine={engine} tool="hand" />);
    await ready();
    fireEvent.wheel(canvas(), { deltaX: 10000, deltaY: -10000 });
    expect(artboard()).toHaveAttribute("data-pan-x", "-240");
    expect(artboard()).toHaveAttribute("data-pan-y", "240");
    const reset = await screen.findByRole("button", { name: "100 % et recentrer" });
    expect(reset.closest(".canvas-controls")).toHaveClass("floating-panel");
    act(() => {
      actions.run("recenter");
    });
    expect(artboard()).toHaveAttribute("data-pan-x", "0");
    pointerDrag(canvas(), point(0, 0), point(10000, -10000));
    expect(artboard()).toHaveAttribute("data-pan-x", "240");
    expect(artboard()).toHaveAttribute("data-pan-y", "-240");
    act(() => {
      actions.run("zoomIn");
    });
    expect(artboard()).toHaveAttribute("data-zoom", "1.2");
    act(() => {
      actions.run("zoomOut");
    });
    act(() => {
      actions.run("reset");
    });
    expect(artboard()).toHaveAttribute("data-pan-y", "0");
    act(() => {
      actions.run("fit");
    });
    expect(engine.getSnapshot()).toBe(baseline);
    unmount();
    expect(actions.run("reset")).toBe(false);
  });
  it("selects and moves one layer with a single undoable transaction", async () => {
    const layer = rectangle();
    const { engine } = setup([layer]);
    render(<EditorCanvas engine={engine} tool="pointer" />);
    await ready();
    pointerDrag(canvas(), point(40, 40), point(70, 80), { altKey: true });
    expect(engine.getSnapshot().selection).toEqual([layer.id]);
    expect(engine.getSnapshot().project.pages[0]!.layers[0]).toEqual(
      expect.objectContaining({ x: 50, y: 60 }),
    );
    expect(engine.getSnapshot().canUndo).toBe(true);
    act(() => engine.undo());
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(20);
  });
  it("marquee reads current paint state after an opacity-only commit without rerendering the canvas", async () => {
    const layer = rectangle();
    const { engine } = setup([layer]);
    render(<EditorCanvas engine={engine} tool="pointer" />);
    await ready();
    act(() => engine.execute({ type: "updateLayers", ids: [layer.id], patch: { opacity: 0 } }));
    pointerDrag(canvas(), point(0, 0), point(90, 80));
    expect(engine.getSnapshot().selection).toEqual([]);
    act(() => engine.undo());
    pointerDrag(canvas(), point(0, 0), point(90, 80));
    expect(engine.getSnapshot().selection).toEqual([layer.id]);
  });
  it.each(["shiftKey", "ctrlKey", "metaKey"] as const)(
    "supports %s selection, toggling and marquee without an unwanted document commit",
    async (modifier) => {
      const one = rectangle();
      const two = createLayer("ellipse", { x: 110, y: 20, width: 50, height: 50 });
      const { engine } = setup([one, two]);
      render(<EditorCanvas engine={engine} tool="pointer" />);
      await ready();
      pointerDrag(canvas(), point(30, 30), point(30, 30));
      expect(engine.getSnapshot().canUndo).toBe(false);
      pointerDrag(canvas(), point(120, 30), point(120, 30), { [modifier]: true });
      expect(engine.getSnapshot().selection).toEqual([one.id, two.id]);
      pointerDrag(canvas(), point(30, 30), point(30, 30), { [modifier]: true });
      expect(engine.getSnapshot().selection).toEqual([two.id]);
      pointerDrag(canvas(), point(0, 0), point(85, 75));
      expect(engine.getSnapshot().selection).toEqual([one.id]);
      pointerDrag(canvas(), point(100, 0), point(170, 80), { [modifier]: true });
      expect(new Set(engine.getSnapshot().selection)).toEqual(new Set([one.id, two.id]));
      fireEvent.keyDown(canvas(), { key: "Escape" });
      expect(engine.getSnapshot().selection).toEqual([]);
    },
  );
  it.each(["rectangle", "ellipse"] as const)(
    "draws %s and commits only at pointer release",
    async (tool) => {
      const { engine } = setup([]);
      render(<EditorCanvas engine={engine} tool={tool} />);
      await ready();
      fireEvent.pointerDown(canvas(), point(30, 40));
      fireEvent.pointerMove(canvas(), { ...point(80, 100), shiftKey: true });
      expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(0);
      fireEvent.pointerUp(canvas(), point(80, 100));
      const inserted = engine.getSnapshot().project.pages[0]!.layers[0]!;
      expect(inserted.kind).toBe(tool);
      expect(inserted.width).toBe(50);
      expect(inserted.height).toBe(50);
      pointerDrag(canvas(), point(10, 10), point(10, 10));
      expect(engine.getSnapshot().project.pages[0]!.layers[1]!.width).toBe(180);
    },
  );
  it("draws an editable text frame imperatively and commits only on release with one undo", async () => {
    const { engine } = setup([]);
    render(<EditorCanvas engine={engine} tool="text" />);
    await ready();
    const baseline = engine.getSnapshot();
    fireEvent.pointerDown(canvas(), point(180, 140));
    fireEvent.pointerMove(canvas(), { ...point(50, 60), shiftKey: true });
    expect(engine.getSnapshot()).toBe(baseline);
    expect(renderer.render.mock.calls.at(-1)![0].layers[0]).toMatchObject({
      kind: "text",
      x: 50,
      y: 60,
      width: 130,
      height: 80,
    });
    fireEvent.pointerUp(canvas(), point(50, 60));
    expect(engine.getSnapshot().project.pages[0]!.layers[0]).toMatchObject({
      kind: "text",
      x: 50,
      y: 60,
      width: 130,
      height: 80,
      text: "Votre texte",
    });
    act(() => engine.undo());
    expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(0);
    expect(engine.getSnapshot().canUndo).toBe(false);
    fireEvent.pointerDown(canvas(), point(30, 40));
    fireEvent.pointerMove(canvas(), point(90, 90));
    fireEvent.pointerCancel(canvas());
    expect(engine.getSnapshot().canUndo).toBe(false);
    pointerDrag(canvas(), point(50, 60), point(50, 60));
    expect(engine.getSnapshot().project.pages[0]!.layers[0]).toMatchObject({
      width: 360,
      height: 100,
    });
  });
  it("uses hand, middle button and spacebar for pan without modifying document content", async () => {
    const { engine } = setup();
    const { rerender } = render(<EditorCanvas engine={engine} tool="hand" />);
    await ready();
    pointerDrag(canvas(), point(20, 20), point(50, 60));
    expect(artboard()).toHaveAttribute("data-pan-x", "30");
    rerender(<EditorCanvas engine={engine} tool="pointer" />);
    pointerDrag(canvas(), point(0, 0), point(10, 10), { button: 1 });
    expect(artboard()).toHaveAttribute("data-pan-x", "40");
    fireEvent.keyDown(canvas(), { code: "Space" });
    pointerDrag(canvas(), point(0, 0), point(15, 10));
    expect(artboard()).toHaveAttribute("data-pan-x", "55");
    fireEvent.keyUp(canvas(), { code: "Space" });
    fireEvent.blur(canvas());
    expect(engine.getSnapshot().canUndo).toBe(false);
  });
  it("converts image selection clicks into local object-segmentation prompts", async () => {
    const assetId = "image";
    const layer = createLayer("image", { assetId, x: 20, y: 20, width: 60, height: 50 });
    const page = createPage({ width: 200, height: 160, layers: [layer] });
    const engine = new EditorEngine(
      createProject({
        pages: [page],
        assets: {
          image: {
            id: assetId,
            name: "image",
            mime: "image/png",
            width: 6,
            height: 5,
            dataUrl: "data:image/png;base64,AA==",
          },
        },
      }),
    );
    const prompt = vi.fn();
    const error = vi.fn();
    const { rerender } = render(
      <EditorCanvas engine={engine} tool="segment" onImagePoint={prompt} onError={error} />,
    );
    await ready();
    fireEvent.pointerDown(canvas(), point(40, 40));
    expect(prompt).toHaveBeenCalledWith(layer.id, 20, 20);
    rerender(<EditorCanvas engine={engine} tool="segment" onImagePoint={prompt} onError={error} />);
    fireEvent.pointerDown(canvas(), point(180, 140));
    expect(error).toHaveBeenCalledWith("Cliquez sur une image pour créer son masque.");
  });
  it("resizes and rotates through preview patches and commits on release", async () => {
    const layer = rectangle();
    const { engine } = setup([layer]);
    engine.select([layer.id]);
    render(<EditorCanvas engine={engine} tool="pointer" />);
    await ready();
    const handle = screen.getByRole("button", { name: `Redimensionner ${layer.name} se` });
    fireEvent.pointerDown(handle, point(80, 70));
    fireEvent.pointerMove(canvas(), point(100, 80));
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.width).toBe(60);
    fireEvent.pointerUp(canvas(), point(100, 80));
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.width).toBe(80);
    const rotate = screen.getByRole("button", { name: `Tourner ${layer.name} rotate` });
    fireEvent.pointerDown(rotate, point(100, 50));
    fireEvent.pointerMove(canvas(), { ...point(50, 100), shiftKey: true });
    fireEvent.pointerUp(canvas(), point(50, 100));
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.rotation).not.toBe(0);
  });
  it("cancels pointer gestures and ignores secondary clicks and controls", async () => {
    const { engine } = setup();
    render(<EditorCanvas engine={engine} tool="pointer" />);
    await ready();
    fireEvent.pointerMove(canvas(), point(60, 60));
    fireEvent.pointerUp(canvas(), point(60, 60));
    fireEvent.pointerDown(canvas(), { ...point(40, 40), button: 2 });
    expect(engine.getSnapshot().selection).toEqual([]);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Zoomer" }), point(40, 40));
    fireEvent.pointerDown(canvas(), point(40, 40));
    fireEvent.pointerMove(canvas(), point(70, 70));
    fireEvent.pointerCancel(canvas());
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(20);
    expect(engine.getSnapshot().canUndo).toBe(false);
  });
  it("renders inspector previews, guides, hidden handles and bulk drops without mutating the engine", async () => {
    const layer = rectangle();
    layer.locked = true;
    const { engine } = setup([layer]);
    engine.select([layer.id]);
    engine.execute({ type: "addGuide", guide: { id: "gx", axis: "x", position: 20 } });
    engine.execute({ type: "addGuide", guide: { id: "gy", axis: "y", position: 30 } });
    const drop = vi.fn();
    render(
      <EditorCanvas
        engine={engine}
        tool="pointer"
        previewSource={{
          read: () => ({ target: "page", patch: { background: "#abcdef" } }),
          subscribe: () => () => undefined,
        }}
        onDropFiles={drop}
      />,
    );
    await ready();
    expect(renderer.render.mock.calls.at(-1)![0].background).toBe("#abcdef");
    expect(screen.queryByRole("button", { name: /Redimensionner/ })).not.toBeInTheDocument();
    const file = new File(["one"], "one.png", { type: "image/png" });
    fireEvent.dragOver(canvas(), { dataTransfer: { types: ["Files"], files: [] } });
    expect(screen.getByText("Déposez vos images ici")).toBeInTheDocument();
    const internalLeave = fileDragEvent("dragleave", { relatedTarget: canvas() });
    fireEvent(canvas(), internalLeave);
    expect(screen.getByText("Déposez vos images ici")).toBeInTheDocument();
    const externalLeave = fileDragEvent("dragleave", { relatedTarget: document.body });
    fireEvent(canvas(), externalLeave);
    expect(screen.queryByText("Déposez vos images ici")).not.toBeInTheDocument();
    fireEvent.drop(canvas(), { dataTransfer: { files: [file] } });
    expect(drop).toHaveBeenCalledWith([file]);
  });
  it("inherits ancestor visibility and locking for selection overlays and resize handles", async () => {
    const group = createLayer("group", {
      id: "parent",
      width: 150,
      height: 120,
      visible: false,
      locked: true,
    });
    const child = createLayer("rectangle", {
      id: "child",
      parentId: group.id,
      x: 10,
      y: 10,
      width: 30,
      height: 30,
    });
    const { engine } = setup([group, child]);
    engine.select([child.id]);
    const { container } = render(<EditorCanvas engine={engine} tool="pointer" />);
    await ready();
    const retained = container.querySelector(".canvas-selection");
    expect(retained).toHaveStyle({ display: "none" });
    act(() => engine.execute({ type: "updateLayers", ids: [group.id], patch: { visible: true } }));
    expect(container.querySelector(".canvas-selection")).toBe(retained);
    expect(retained).toBeVisible();
    expect(screen.queryByRole("button", { name: /Redimensionner/ })).not.toBeInTheDocument();
    act(() => engine.execute({ type: "updateLayers", ids: [group.id], patch: { locked: false } }));
    expect(
      screen.getByRole("button", { name: `Redimensionner ${child.name} se` }),
    ).toBeInTheDocument();
  });
  it("changes paint and geometry previews imperatively without a React canvas commit", async () => {
    history.replaceState({}, "", "/?automation=1");
    const layer = rectangle();
    const { engine } = setup([layer]);
    engine.select([layer.id]);
    const store = createStore();
    const previewSource = createPreviewSource(store);
    render(<EditorCanvas engine={engine} tool="pointer" previewSource={previewSource} />);
    await ready();
    const count = canvas().dataset.reactRenders;
    const baseline = engine.getSnapshot();
    act(() =>
      store.set(previewAtom, {
        target: "layer",
        layerId: layer.id,
        patch: { fill: "#00ff00", width: 100, x: 45 },
      }),
    );
    expect(canvas().dataset.reactRenders).toBe(count);
    expect(renderer.render.mock.calls.at(-1)![0].layers[0]).toMatchObject({
      fill: "#00ff00",
      width: 100,
      x: 45,
    });
    expect(engine.getSnapshot()).toBe(baseline);
    expect(document.querySelector<HTMLElement>(".canvas-selection")!.style.width).toBe("100px");
    act(() => store.set(previewAtom, { target: "page", patch: { width: 240, height: 180 } }));
    expect(canvas().dataset.reactRenders).toBe(count);
    expect(screen.getByTestId("artboard")).toHaveStyle({ width: "240px", height: "180px" });
    expect(engine.getSnapshot()).toBe(baseline);
    act(() => {
      store.set(previewAtom, null);
      engine.execute({ type: "updateLayers", ids: [layer.id], patch: { fill: "#00ff00" } });
    });
    expect(canvas().dataset.reactRenders).toBe(count);
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.fill).toBe("#00ff00");
    history.replaceState({}, "", "/");
  });
  it("passes current scene and errors directly to the GPU adapter without a CPU rendering task", async () => {
    const { engine } = setup();
    const error = vi.fn();
    const { rerender } = render(<EditorCanvas engine={engine} tool="pointer" onError={error} />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "GPU error" }));
    expect(error).toHaveBeenCalledWith("GPU inaccessible");
    rerender(
      <EditorCanvas
        engine={engine}
        tool="pointer"
        previewSource={{
          read: () => ({ target: "page", patch: { background: "#123456" } }),
          subscribe: () => () => undefined,
        }}
        onError={error}
      />,
    );
    expect(renderer.render.mock.calls.at(-1)![0].background).toBe("#123456");
    act(() => engine.execute({ type: "updatePage", patch: { width: 250 } }));
    act(() => engine.execute({ type: "updatePage", patch: { width: 300 } }));
    expect(screen.getByTestId("scene-source")).toHaveAttribute("data-width", "300");
  });
});

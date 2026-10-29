import { createElement, useRef } from "react";
import { act, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { useCanvasPresentation } from "../../../src/canvas/viewport/use-canvas-presentation";
import { createWorkspace } from "../../../src/canvas/artboards/workspace";
import { ViewMotion } from "../../../src/canvas/viewport/motion";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { createPlaybackSource } from "../../../src/canvas/session/playback-source";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";

it("paints live CSS poses without reconstructing unchanged selection geometry on pan", () => {
  const layer = createLayer("rectangle", { id: "selected", width: 80, height: 50 }),
    engine = new EditorEngine(
      createProject({ pages: [createPage({ width: 200, height: 160, layers: [layer] })] }),
    ),
    controller = new SceneController(engine, EMPTY_PREVIEW_SOURCE),
    workspace = createWorkspace(engine, controller),
    beforePaint = vi.fn(),
    motion = new ViewMotion({
      clock: { now: () => 0, request: () => 1, cancel: () => {} },
      reduced: () => true,
      constrain: (view) => view,
    });
  function Probe() {
    const viewport = useRef<HTMLDivElement>(null);
    useCanvasPresentation({ controller, workspace, motion, viewport, beforePaint });
    return createElement(
      "div",
      { ref: viewport },
      createElement("div", {
        "data-testid": "artboard",
        "data-artboard-id": engine.getSnapshot().pageId,
      }),
      createElement("span", { className: "canvas-zoom" }),
      createElement(
        "div",
        { className: "canvas-selection", "data-layer-id": layer.id },
        createElement("button", { className: "canvas-handle" }),
        createElement("span", { className: "canvas-selection-size" }),
        createElement("span", { className: "canvas-layer-lock" }),
      ),
      createElement("div", { className: "canvas-selection", "data-layer-id": "missing" }),
    );
  }
  const { container, unmount } = render(createElement(Probe)),
    overlay = container.querySelector<HTMLElement>('[data-layer-id="selected"]')!,
    board = container.querySelector<HTMLElement>('[data-testid="artboard"]')!;
  expect(overlay).toHaveStyle({ width: "80px", height: "50px" });
  const untouched = overlay.style.cssText;
  const label = container.querySelector(".canvas-zoom")!,
    text = label.firstChild;
  act(() => motion.jump({ x: 25, y: -12, zoom: 1 }, false));
  expect(board).toHaveAttribute("data-pan-x", "25");
  expect(board.style.transform).toContain("translate3d(25px, -12px, 0)");
  expect(overlay.style.cssText).toBe(untouched);
  expect(label.firstChild).toBe(text);
  expect(label).toHaveTextContent("100%");
  act(() => motion.jump({ x: 25, y: -12, zoom: 2 }, false));
  expect(overlay.style.borderWidth).toBe("0.5px");
  expect(overlay.querySelector(".canvas-layer-lock")).toHaveStyle({
    transform: "translate(-50%, -50%) scale(0.5)",
  });
  expect(label).toHaveTextContent("200%");
  act(() => controller.setGesture([{ layerId: layer.id, patch: { width: 120 } }]));
  expect(overlay).toHaveStyle({ width: "120px" });
  expect(overlay.querySelector("span")).toHaveTextContent("120 × 50");
  act(() =>
    createPlaybackSource(engine).set({ page: engine.getSnapshot().project.pages[0]!, assets: {} }),
  );
  expect(overlay).toHaveStyle({ display: "none" });
  unmount();
  motion.dispose();
  expect(beforePaint).toHaveBeenCalled();
});
it("allows an absent presentation surface without retaining scene listeners", () => {
  const engine = new EditorEngine(),
    controller = new SceneController(engine, EMPTY_PREVIEW_SOURCE),
    workspace = createWorkspace(engine, controller),
    motion = new ViewMotion({
      clock: { now: () => 0, request: () => 1, cancel: () => {} },
      reduced: () => true,
      constrain: (view) => view,
    });
  function Probe() {
    useCanvasPresentation({
      controller,
      workspace,
      motion,
      viewport: { current: null },
      beforePaint: () => {},
    });
    return null;
  }
  const { unmount } = render(createElement(Probe));
  unmount();
  motion.dispose();
});

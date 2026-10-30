import { useEffect } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { transformPoint } from "@musart/core";
import { EditorCanvas } from "../../src/canvas/EditorCanvas";
import type { SceneController } from "../../src/canvas/session/scene-controller";
import { createPlaybackSource } from "../../src/canvas/session/playback-source";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import { canvasPoint } from "../support/canvas-pointer";
import { motionPoseFixture } from "../support/motion-pose";

const scene = vi.hoisted(() => ({ controller: null as SceneController | null }));
vi.mock("../../src/canvas/render/EditorScene", () => ({
  EditorScene: ({ controller }: { controller: SceneController }) => {
    useEffect(() => {
      scene.controller = controller;
    }, [controller]);
    return <div data-testid="motion-scene" />;
  },
}));
beforeEach(() => {
  scene.controller = null;
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
    setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 1000, 800),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

test("a paused selected image mounts on its displayed pose and resizes in its animated parent's coordinates", () => {
  const d = motionPoseFixture();
  const mount = render(
    <TooltipProvider>
      <EditorCanvas engine={d.engine} tool="pointer" />
    </TooltipProvider>,
  );
  act(() => d.engine.select([d.picture.id]));
  const outline = mount.container.querySelector<HTMLElement>(
    `.canvas-selection[data-layer-id="${d.picture.id}"]`,
  )!;
  expect(outline).toHaveStyle({ width: "45px", height: "30px" });
  expect(outline.style.transform).toBe(`matrix(${d.index.worldMatrix(d.picture.id).join(",")})`);
  const layer = d.index.get(d.picture.id),
    matrix = d.index.worldMatrix(layer.id),
    from = transformPoint(matrix, { x: layer.width, y: layer.height }),
    to = transformPoint(matrix, { x: layer.width + 10, y: layer.height });
  const handle = outline.querySelector<HTMLButtonElement>('.canvas-handle[data-handle="se"]')!;
  const viewport = screen.getByTestId("editor-canvas"),
    before = d.engine.getSnapshot();
  fireEvent.pointerDown(handle, { ...canvasPoint(from.x, from.y), altKey: true });
  fireEvent.pointerMove(viewport, { ...canvasPoint(to.x, to.y), altKey: true });
  const preview = scene.controller!.read().page.layers.find((item) => item.id === layer.id)!;
  expect(preview.width).toBeCloseTo(55);
  expect(preview.height).toBeCloseTo(30);
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.pointerCancel(viewport, canvasPoint(to.x, to.y));
  expect(d.engine.getSnapshot()).toBe(before);
  mount.unmount();
});

test("releasing an animated resize preserves the displayed dimensions and supports one undo/redo", () => {
  const d = motionPoseFixture();
  const mount = render(
    <TooltipProvider>
      <EditorCanvas engine={d.engine} tool="pointer" />
    </TooltipProvider>,
  );
  act(() => d.engine.select([d.picture.id]));
  const layer = d.index.get(d.picture.id),
    matrix = d.index.worldMatrix(layer.id);
  const from = transformPoint(matrix, { x: layer.width, y: layer.height });
  const to = transformPoint(matrix, { x: layer.width + 10, y: layer.height });
  const outline = mount.container.querySelector<HTMLElement>(
    `.canvas-selection[data-layer-id="${layer.id}"]`,
  )!;
  const handle = outline.querySelector<HTMLButtonElement>('.canvas-handle[data-handle="se"]')!;
  const viewport = screen.getByTestId("editor-canvas"),
    before = d.engine.getSnapshot().project;
  fireEvent.pointerDown(handle, { ...canvasPoint(from.x, from.y), altKey: true });
  fireEvent.pointerMove(viewport, { ...canvasPoint(to.x, to.y), altKey: true });
  fireEvent.pointerUp(viewport, { ...canvasPoint(to.x, to.y), altKey: true });
  expect(parseFloat(outline.style.width)).toBeCloseTo(55);
  expect(parseFloat(outline.style.height)).toBeCloseTo(30);
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.find((item) => item.id === layer.id)!.width,
  ).toBe(30);
  expect(d.transport.readFrame()!.layers.find((item) => item.id === layer.id)!.width).toBeCloseTo(
    55,
  );
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
  expect(parseFloat(outline.style.width)).toBe(45);
  act(() => d.engine.redo());
  expect(parseFloat(outline.style.width)).toBeCloseTo(55);
  mount.unmount();
});

test("Play selects a visible evaluated image without editing, while replay remains noninteractive", () => {
  const d = motionPoseFixture();
  const mount = render(
    <TooltipProvider>
      <EditorCanvas engine={d.engine} tool="pointer" />
    </TooltipProvider>,
  );
  const layer = d.index.get(d.picture.id),
    center = transformPoint(d.index.worldMatrix(layer.id), {
      x: layer.width / 2,
      y: layer.height / 2,
    }),
    point = canvasPoint(center.x, center.y),
    viewport = screen.getByTestId("editor-canvas"),
    before = d.engine.getSnapshot();
  act(() => d.transport.play());
  fireEvent.pointerDown(viewport, point);
  fireEvent.pointerMove(viewport, { ...point, clientX: point.clientX + 30 });
  fireEvent.pointerUp(viewport, { ...point, clientX: point.clientX + 30 });
  expect(d.engine.getSnapshot().selection).toEqual([d.picture.id]);
  expect(d.engine.getSnapshot().project).toBe(before.project);
  expect(d.engine.getSnapshot().revision).toBe(before.revision);
  const outline = mount.container.querySelector<HTMLElement>(
    `.canvas-selection[data-layer-id="${d.picture.id}"]`,
  )!;
  expect(outline).toHaveStyle({ width: "45px", height: "30px" });
  expect(outline.querySelector("button")).toBeDisabled();
  act(() => {
    d.transport.pause();
    d.engine.select([]);
    createPlaybackSource(d.engine).set({ page: d.frame.page, assets: before.project.assets });
  });
  fireEvent.pointerDown(viewport, point);
  fireEvent.pointerUp(viewport, point);
  expect(d.engine.getSnapshot().selection).toEqual([]);
  expect(d.engine.getSnapshot().project).toBe(before.project);
  act(() => createPlaybackSource(d.engine).set(null));
  mount.unmount();
});

test("a Play pick preserves focused input ownership and never pauses through native blur", () => {
  const d = motionPoseFixture();
  const mount = render(
    <TooltipProvider>
      <EditorCanvas engine={d.engine} tool="pointer" />
    </TooltipProvider>,
  );
  const layer = d.index.get(d.picture.id),
    center = transformPoint(d.index.worldMatrix(layer.id), {
      x: layer.width / 2,
      y: layer.height / 2,
    });
  const field = document.createElement("input"),
    blur = vi.fn(() => d.transport.pause());
  field.addEventListener("blur", blur);
  document.body.append(field);
  field.focus();
  act(() => d.transport.play());
  fireEvent.pointerDown(screen.getByTestId("editor-canvas"), canvasPoint(center.x, center.y));
  expect(field).toHaveFocus();
  expect(blur).not.toHaveBeenCalled();
  expect(d.transport.read().playing).toBe(true);
  expect(d.engine.getSnapshot().selection).toEqual([d.picture.id]);
  act(() => d.transport.pause());
  field.remove();
  mount.unmount();
});

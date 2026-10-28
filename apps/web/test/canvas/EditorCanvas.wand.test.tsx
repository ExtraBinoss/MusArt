import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createLayer, createPage } from "@musart/core";
import { EditorCanvas } from "../../src/canvas/EditorCanvas";
import type {
  PixelSelectionPort,
  PixelSelectionState,
} from "../../src/services/selection/wand/model";
import { setup } from "../support/ui";
import { canvasPoint as point } from "../support/canvas-pointer";

vi.mock("../../src/canvas/render/EditorScene", () => ({
  EditorScene: () => <div data-testid="wand-scene" />,
}));
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 1000, 800),
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
});
afterEach(() => vi.unstubAllGlobals());

async function fixture() {
  const d = setup(),
    layer = createLayer("image", {
      id: "wand-image",
      assetId: "asset1",
      x: 20,
      y: 20,
      width: 80,
      height: 60,
    });
  d.engine.load({
    ...d.project,
    pages: [createPage({ width: 200, height: 160, layers: [layer] })],
  });
  let state: PixelSelectionState | null = null,
    ready!: () => void;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const prepared = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const port: PixelSelectionPort = {
    read: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin: vi.fn((_id, _x, _y, tolerance) => {
      state = {
        layerId: layer.id,
        width: 80,
        height: 60,
        path: "M0 0H80V60H0Z",
        selected: 4800,
        simplified: false,
        tolerance,
        mode: "new",
        contiguous: true,
        busy: true,
        dragging: true,
      };
      notify();
      return prepared;
    }),
    update: vi.fn(async (tolerance) => {
      if (state) state = { ...state, tolerance, busy: false };
      notify();
    }),
    accept: vi.fn(async () => {
      if (state) state = { ...state, dragging: false };
      notify();
    }),
    cancel: vi.fn(() => {
      state = null;
      notify();
    }),
    invert: vi.fn(async () => {}),
    createMask: vi.fn(async () => {}),
    erase: vi.fn(async () => {}),
    deselect: vi.fn(),
    dispose: vi.fn(),
  };
  d.mount(
    <EditorCanvas
      engine={d.engine}
      tool="wand"
      services={{ ...d.services, pixelSelection: port }}
    />,
  );
  await waitFor(() => expect(screen.getByTestId("wand-scene")).toBeInTheDocument());
  return { ...d, port, ready, canvas: screen.getByTestId("editor-canvas") };
}

test("expected capture loss after pointer release retains a cold wand completion until its worker result is accepted", async () => {
  const d = await fixture(),
    before = d.engine.getSnapshot().project;
  fireEvent.pointerDown(d.canvas, point(40, 40));
  expect(d.port.begin).toHaveBeenCalledOnce();
  fireEvent.pointerUp(d.canvas, point(40, 40));
  fireEvent.lostPointerCapture(d.canvas, { pointerId: 1 });
  expect(d.port.cancel).not.toHaveBeenCalled();
  expect(d.port.accept).not.toHaveBeenCalled();
  await act(async () => {
    d.ready();
    await Promise.resolve();
  });
  await waitFor(() => expect(d.port.accept).toHaveBeenCalledOnce());
  expect(d.port.read()).toMatchObject({ busy: false, dragging: false, selected: 4800 });
  fireEvent.lostPointerCapture(d.canvas, { pointerId: 1 });
  expect(d.port.cancel).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

test.each(["pointerCancel", "lostPointerCapture"] as const)(
  "real %s before wand release cancels preparation and never accepts its late result",
  async (cancel) => {
    const d = await fixture();
    fireEvent.pointerDown(d.canvas, point(40, 40));
    fireEvent[cancel](d.canvas, { pointerId: 1 });
    expect(d.port.cancel).toHaveBeenCalledOnce();
    fireEvent.pointerUp(d.canvas, point(40, 40));
    await act(async () => {
      d.ready();
      await Promise.resolve();
    });
    expect(d.port.accept).not.toHaveBeenCalled();
    expect(d.port.read()).toBeNull();
    expect(d.engine.getSnapshot().canUndo).toBe(false);
  },
);

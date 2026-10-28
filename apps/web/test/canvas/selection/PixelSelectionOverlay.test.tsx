import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import {
  PixelSelectionOverlay,
  PixelSelectionToolbar,
} from "../../../src/canvas/selection/PixelSelectionOverlay";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
import { changeLanguage } from "../../../src/state/i18n";
import { TooltipProvider } from "../../../src/components/ui/tooltip";
import type {
  PixelSelectionPort,
  PixelSelectionState,
} from "../../../src/services/selection/wand/model";
function fixture() {
  let state: PixelSelectionState | null = {
      layerId: "image",
      path: "M0 0H10",
      width: 10,
      height: 5,
      selected: 20,
      simplified: false,
      tolerance: 32,
      mode: "new",
      contiguous: true,
      busy: false,
      dragging: false,
    },
    zoom = 1;
  const listeners = new Set<() => void>(),
    viewListeners = new Set<() => void>(),
    port: PixelSelectionPort = {
      read: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      begin: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
      accept: vi.fn(async () => {}),
      invert: vi.fn(async () => {}),
      createMask: vi.fn(async () => {}),
      erase: vi.fn(async () => {}),
      deselect: vi.fn(),
      cancel: vi.fn(),
      dispose: vi.fn(),
    },
    engine = new EditorEngine(
      createProject({
        pages: [
          createPage({
            layers: [
              createLayer("rectangle", { id: "image", x: 20, y: 30, width: 100, height: 50 }),
            ],
          }),
        ],
      }),
    ),
    controller = new SceneController(engine, EMPTY_PREVIEW_SOURCE),
    viewport = { current: document.createElement("div") },
    viewSource = {
      read: () => ({ x: 0, y: 0, zoom }),
      subscribe: (listener: () => void) => {
        viewListeners.add(listener);
        return () => {
          viewListeners.delete(listener);
        };
      },
    };
  Object.defineProperties(viewport.current, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  return {
    viewport,
    port,
    controller,
    viewSource,
    listeners,
    viewListeners,
    engine,
    publish: (next: typeof state) => {
      state = next;
      listeners.forEach((listener) => listener());
    },
    zoom: (value: number) => {
      zoom = value;
      viewListeners.forEach((listener) => listener());
    },
  };
}
it("updates retained paths and zoom strokes without rerendering the canvas parent and releases listeners", () => {
  const d = fixture();
  let renders = 0;
  function Canvas() {
    renders++;
    return <PixelSelectionOverlay {...d} />;
  }
  const view = render(<Canvas />),
    svg = screen.getByTestId("pixel-selection-outline");
  expect(svg.querySelector("path")).toHaveAttribute("d", "M0 0H10");
  expect(svg.querySelector("g")).toHaveAttribute(
    "transform",
    "translate(-140 -240) scale(1) matrix(1,0,0,1,20,30) scale(10,10)",
  );
  act(() => {
    d.publish({ ...d.port.read()!, path: "M0 0H8", selected: 16, dragging: true, tolerance: 64 });
    d.zoom(2);
  });
  expect(svg.querySelector("path")).toHaveAttribute("d", "M0 0H8");
  for (const zoom of [0.25, 1, 2, 4]) {
    act(() => d.zoom(zoom));
    expect(svg.querySelector("path")).toHaveAttribute("stroke-width", "1");
    expect(svg.querySelector("path")).toHaveAttribute("vector-effect", "non-scaling-stroke");
  }
  expect(svg).toHaveAttribute("viewBox", "0 0 800 600");
  expect(svg).toHaveAttribute("data-selection-tolerance", "64");
  expect(renders).toBe(1);
  act(() => d.engine.execute({ type: "deleteLayers", ids: ["image"] }));
  expect(svg).not.toBeVisible();
  act(() => d.publish(null));
  expect(svg).not.toBeVisible();
  view.unmount();
  expect(d.listeners.size).toBe(0);
  expect(d.viewListeners.size).toBe(0);
});
it("offers explicit mask creation, inversion and deselection with pending/error states", async () => {
  await changeLanguage("fr");
  const d = fixture(),
    onError = vi.fn();
  render(
    <TooltipProvider>
      <PixelSelectionToolbar port={d.port} onError={onError} />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Garder la zone" }));
  await waitFor(() => expect(d.port.createMask).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Effacer la zone" }));
  await waitFor(() => expect(d.port.erase).toHaveBeenCalledOnce());
  vi.mocked(d.port.invert).mockRejectedValueOnce(Error("mask failure"));
  fireEvent.click(screen.getByRole("button", { name: "Inverser la sélection" }));
  await waitFor(() => expect(onError).toHaveBeenCalledWith("mask failure"));
  act(() => d.publish({ ...d.port.read()!, busy: true }));
  expect(screen.getByRole("button", { name: "Garder la zone" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Effacer la zone" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Inverser la sélection" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Désélectionner" }));
  expect(d.port.deselect).toHaveBeenCalledOnce();
});

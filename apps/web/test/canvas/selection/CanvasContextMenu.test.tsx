import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { createPortal } from "react-dom";
import { expect, it, vi } from "vitest";
import { CanvasContextMenu } from "../../../src/canvas/selection/CanvasContextMenu";
import { setup } from "../../support/ui";
import { createMotionTransport } from "../../../src/services/motion/transport";
import * as requests from "../../../src/components/motion/transitions/requests";
import { TransitionRequestHost } from "../../../src/components/motion/transitions/TransitionRequestHost";
import { EditorEngine, type EnginePort } from "@musart/core";

vi.mock("../../../src/components/motion/transitions/TransitionPreview", () => ({
  TransitionPreview: () => null,
}));

function fixture(withHost = false) {
  const d = setup(),
    target = vi.fn(() => ({ compositionId: d.page.id, layerId: d.rectangle.id, locked: false }));
  const content = (engine: EnginePort) => (
    <>
      {withHost && <TransitionRequestHost engine={engine} />}
      <CanvasContextMenu engine={engine} resolveTarget={target}>
        <div className="editor-canvas" data-testid="context-canvas" tabIndex={0}>
          <button data-canvas-control>Overlay</button>
        </div>
        {createPortal(<button>Portaled control</button>, document.body)}
      </CanvasContextMenu>
    </>
  );
  const view = d.mount(content(d.engine));
  const canvas = screen.getByTestId("context-canvas");
  const down = { pointerId: 1, button: 2, clientX: 100, clientY: 100 };
  return { ...d, target, canvas, down, view, content };
}
it("opens a layer-specific action only after a stationary right-button release", async () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project;
  fireEvent.pointerDown(d.canvas, d.down);
  fireEvent.contextMenu(d.canvas, d.down);
  expect(screen.queryByRole("menu")).toBeNull();
  await act(async () => {
    fireEvent.pointerUp(d.canvas, d.down);
  });
  expect(screen.getByRole("menuitem", { name: "Ajouter une animation" })).toBeVisible();
  expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
  expect(d.engine.getSnapshot().project).toBe(before);
});
it("leaves portaled controls outside the canvas gesture and context menu", async () => {
  const d = fixture(),
    portal = screen.getByRole("button", { name: "Portaled control" });
  fireEvent.pointerDown(portal, d.down);
  await act(async () => {
    fireEvent.pointerUp(portal, d.down);
  });
  expect(fireEvent.contextMenu(portal, { button: 0 })).toBe(true);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(d.target).not.toHaveBeenCalled();
});
it("pauses playback and retains the occurrence under the pointer when the menu opens", async () => {
  const d = fixture();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const first = d.engine
    .getSnapshot()
    .project.pages[0]!.motion!.tracks.find((track) => track.layerId === d.rectangle.id)!;
  d.engine.execute({
    type: "setMotionTrackRange",
    trackId: first.id,
    start: { value: 0, rate: 1 },
    end: { value: 1, rate: 1 },
  });
  d.engine.execute({
    type: "addMotionOccurrence",
    layerId: d.rectangle.id,
    start: { value: 1, rate: 1 },
    end: { value: 2, rate: 1 },
  });
  const transport = createMotionTransport(d.engine),
    request = vi.spyOn(requests, "requestLayerTransition").mockResolvedValue(true);
  try {
    transport.seek({ value: 1, rate: 2 });
    transport.play();
    fireEvent.pointerDown(d.canvas, d.down);
    await act(async () => {
      fireEvent.pointerUp(d.canvas, d.down);
    });
    expect(transport.read().playing).toBe(false);
    transport.seek({ value: 3, rate: 2 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Ajouter une animation" }));
    expect(request).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        d.engine,
        d.page.id,
        d.rectangle.id,
        { x: 100, y: 100 },
        first.id,
      ),
    );
  } finally {
    request.mockRestore();
    transport.dispose();
  }
});
it("preserves right-drag marquee, canceled pointers, native overlay menus and stale document ownership", async () => {
  const d = fixture();
  fireEvent.pointerDown(d.canvas, d.down);
  fireEvent.pointerMove(d.canvas, { ...d.down, clientX: 110 });
  await act(async () => {
    fireEvent.pointerUp(d.canvas, d.down);
  });
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.pointerDown(d.canvas, d.down);
  fireEvent.pointerCancel(d.canvas, d.down);
  await act(async () => {
    fireEvent.pointerUp(d.canvas, d.down);
  });
  fireEvent.pointerDown(screen.getByRole("button", { name: "Overlay" }), d.down);
  await act(async () => {
    fireEvent.pointerUp(screen.getByRole("button", { name: "Overlay" }), d.down);
  });
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.pointerDown(d.canvas, d.down);
  d.engine.execute({ type: "renameProject", name: "Changed while held" });
  await act(async () => {
    fireEvent.pointerUp(d.canvas, d.down);
  });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(d.target).not.toHaveBeenCalled();
});

it("hands a captured canvas action to the real persistent host after focus-scope retirement", async () => {
  const d = fixture(true);
  act(() => d.engine.execute({ type: "setCompositionMode", mode: "motion" }));
  const before = d.engine.getSnapshot().project;
  const track = before.pages[0]!.motion!.tracks.find((item) => item.layerId === d.rectangle.id)!;
  fireEvent.pointerDown(d.canvas, d.down);
  await act(async () => {
    fireEvent.pointerUp(d.canvas, d.down);
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "Ajouter une animation" }));
  expect(await screen.findByRole("dialog", { name: "Ajouter une animation" })).toBeVisible();
  expect(screen.queryByRole("menu")).toBeNull();
  expect(requests.getTransitionRequests(d.engine).read()?.origin.trackId).toBe(track.id);
  expect(d.engine.getSnapshot().project).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "Fade" }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.type).toBe("transition");
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
});

it.each(["edit", "replacement", "unmount"] as const)(
  "retires a pending handoff on %s before the close acknowledgment",
  async (change) => {
    vi.useFakeTimers();
    const d = fixture(),
      request = vi.spyOn(requests, "requestLayerTransition").mockResolvedValue(true);
    try {
      fireEvent.pointerDown(d.canvas, d.down);
      await act(async () => {
        fireEvent.pointerUp(d.canvas, d.down);
      });
      fireEvent.click(screen.getByRole("menuitem", { name: "Ajouter une animation" }));
      expect(request).not.toHaveBeenCalled();
      if (change === "edit")
        act(() => d.engine.execute({ type: "renameProject", name: "Changed while closing" }));
      else if (change === "replacement")
        d.view.rerender(d.content(new EditorEngine(d.engine.getSnapshot().project)));
      else d.view.unmount();
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(request).not.toHaveBeenCalled();
    } finally {
      d.view.unmount();
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      request.mockRestore();
      vi.useRealTimers();
    }
  },
);

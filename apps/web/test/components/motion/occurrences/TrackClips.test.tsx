import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { listLayerMotionOccurrences } from "@musart/core";
import { setup } from "../../../support/ui";
import { createMotionTransport } from "../../../../src/services/motion/transport";
import { TrackClips } from "../../../../src/components/motion/occurrences/TrackClips";

test("readmits gap hover after dragging and a range commit without pointer reentry", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const track = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
  d.engine.execute({
    type: "setMotionTrackRange",
    trackId: track.id,
    start: { value: 0, rate: 1 },
    end: { value: 1, rate: 1 },
  });
  let pending: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    pending = callback;
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const transport = createMotionTransport(d.engine);
  function render() {
    const page = d.engine.getSnapshot().project.pages[0]!;
    return (
      <TrackClips
        engine={d.engine}
        page={page}
        layerId={d.rectangle.id}
        name="Hero"
        tracks={listLayerMotionOccurrences(page, d.rectangle.id)}
        duration={2}
        scale={100}
        disabled={false}
        transport={transport}
        onSelect={() => {}}
      />
    );
  }
  const view = d.mount(render());
  const surface = view.container.querySelector<HTMLElement>(".motion-occurrence-surface")!;
  const rect = vi.spyOn(surface, "getBoundingClientRect");
  fireEvent.pointerEnter(surface, { clientX: 150, buttons: 0 });
  act(() => pending?.(0));
  const ghost = screen.getByRole("button", { name: "Ajouter un clip de Hero ici" });
  fireEvent.pointerMove(surface, { clientX: 140, buttons: 1 });
  expect(ghost).not.toBeVisible();
  fireEvent.pointerMove(surface, { clientX: 150, buttons: 0 });
  act(() => pending?.(0));
  expect(ghost).toBeVisible();
  expect(rect).toHaveBeenCalledTimes(2);
  act(() =>
    d.engine.execute({
      type: "setMotionTrackRange",
      trackId: track.id,
      start: { value: 0, rate: 1 },
      end: { value: 4, rate: 5 },
    }),
  );
  view.rerender(render());
  expect(ghost).not.toBeVisible();
  for (const x of [150, 155, 160]) fireEvent.pointerMove(surface, { clientX: x, buttons: 0 });
  act(() => pending?.(0));
  expect(ghost).toBeVisible();
  expect(rect).toHaveBeenCalledTimes(3);
  fireEvent.click(ghost);
  expect(
    listLayerMotionOccurrences(d.engine.getSnapshot().project.pages[0]!, d.rectangle.id),
  ).toHaveLength(2);
  view.unmount();
});

test("renders multiple bars on one row and inserts a bounded hover copy without a new layer", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const first = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
  d.engine.execute({
    type: "duplicateMotionOccurrence",
    trackId: first.id,
    start: { value: 3, rate: 1 },
    end: { value: 4, rate: 1 },
  });
  const before = d.engine.getSnapshot().project;
  const page = before.pages[0]!,
    tracks = listLayerMotionOccurrences(page, d.rectangle.id);
  const transport = createMotionTransport(d.engine),
    onSelect = vi.fn();
  let pending: FrameRequestCallback | undefined;
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    pending = callback;
    return 1;
  });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const mount = d.mount(
    <TrackClips
      engine={d.engine}
      page={page}
      layerId={d.rectangle.id}
      name="Hero"
      tracks={tracks}
      chosenId={first.id}
      duration={4}
      scale={100}
      disabled={false}
      transport={transport}
      onSelect={onSelect}
    />,
  );
  const bars = mount.container.querySelectorAll("[data-track-id]");
  expect(bars).toHaveLength(2);
  const layerCount = page.layers.length;
  const surface = mount.container.querySelector<HTMLElement>(".motion-occurrence-surface")!;
  fireEvent.pointerEnter(surface, { clientX: 250, buttons: 0 });
  fireEvent.pointerMove(surface, { clientX: 250, buttons: 0 });
  expect(raf).toHaveBeenCalledTimes(1);
  act(() => pending?.(0));
  const ghost = screen.getByRole("button", { name: "Ajouter un clip de Hero ici" });
  expect(ghost).toBeVisible();
  expect(ghost).toHaveStyle({ left: "250px", width: "50px" });
  fireEvent.pointerMove(ghost, { clientX: 275, buttons: 0 });
  expect(raf).toHaveBeenCalledTimes(1);
  expect(ghost).toHaveStyle({ left: "250px", width: "50px" });
  fireEvent.click(ghost);
  const next = d.engine.getSnapshot().project.pages[0]!;
  expect(next.layers).toHaveLength(layerCount);
  expect(listLayerMotionOccurrences(next, d.rectangle.id)).toHaveLength(3);
  expect(transport.read().time).toEqual({ value: 5, rate: 2 });
  expect(onSelect).toHaveBeenCalledWith(d.rectangle.id, false);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toBe(before);
  mount.unmount();
  raf.mockRestore();
  cancel.mockRestore();
});

test("rejects stale hover copies and cancels its owned RAF on teardown", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const track = d.engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!;
  d.engine.execute({
    type: "setMotionTrackRange",
    trackId: track.id,
    start: { value: 0, rate: 1 },
    end: { value: 1, rate: 1 },
  });
  const page = d.engine.getSnapshot().project.pages[0]!,
    transport = createMotionTransport(d.engine);
  const error = vi.fn();
  let pending: FrameRequestCallback | undefined;
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    pending = callback;
    return 17;
  });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const view = d.mount(
    <TrackClips
      engine={d.engine}
      page={page}
      layerId={d.rectangle.id}
      name="Hero"
      tracks={listLayerMotionOccurrences(page, d.rectangle.id)}
      chosenId={track.id}
      duration={2}
      scale={100}
      disabled={false}
      transport={transport}
      onSelect={() => {}}
      onError={error}
    />,
  );
  const surface = view.container.querySelector<HTMLElement>(".motion-occurrence-surface")!;
  fireEvent.pointerEnter(surface, { clientX: 150, buttons: 0 });
  act(() => pending?.(0));
  const ghost = screen.getByRole("button", { name: "Ajouter un clip de Hero ici" });
  act(() => d.engine.execute({ type: "renameProject", name: "Changed owner" }));
  const before = d.engine.getSnapshot();
  fireEvent.click(ghost);
  expect(error).toHaveBeenCalledWith("changed");
  expect(d.engine.getSnapshot()).toBe(before);
  fireEvent.pointerMove(surface, { clientX: 160, buttons: 0 });
  view.unmount();
  expect(cancel).toHaveBeenCalledWith(17);
  expect(() => pending?.(0)).not.toThrow();
  raf.mockRestore();
  cancel.mockRestore();
});

import { Profiler } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { createLayer, createPage, createProject } from "@musart/core";
import { MotionTimelineDock } from "../../../src/components/motion-shell/MotionTimelineDock";
import { timelineOpenAtom } from "../../../src/state/motion/timeline-state";
import { createMotionTransport } from "../../../src/services/motion/transport";
import { setup } from "../../support/ui";

let reduced = false;
vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => reduced,
}));
afterEach(() => {
  reduced = false;
  vi.unstubAllGlobals();
});

test("keeps visibility in the isolated Dock and changes neither its parent nor Canvas/Inspector React commits", async () => {
  const d = setup(),
    app = vi.fn(),
    canvas = vi.fn(),
    inspector = vi.fn(),
    dock = vi.fn();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  function Host() {
    app();
    return (
      <>
        <Profiler id="Canvas" onRender={canvas}>
          <div data-canvas />
        </Profiler>
        <Profiler id="Inspector" onRender={inspector}>
          <div data-inspector />
        </Profiler>
        <Profiler id="Dock" onRender={dock}>
          <MotionTimelineDock engine={d.engine} />
        </Profiler>
      </>
    );
  }
  const view = d.mount(<Host />);
  await waitFor(() => expect(screen.getByRole("region", { name: "Timeline" })).toBeVisible());
  const parent = app.mock.calls.length,
    canvasCount = canvas.mock.calls.length,
    inspectorCount = inspector.mock.calls.length;
  act(() => d.store.set(timelineOpenAtom, false));
  const exiting = document.querySelector(".motion-timeline-dock")!;
  expect(exiting).toHaveAttribute("inert");
  expect(exiting).toHaveAttribute("aria-hidden", "true");
  expect(exiting).toHaveStyle({ pointerEvents: "none" });
  expect(exiting).toHaveAttribute("data-motion-presence", "exiting");
  await waitFor(() => expect(exiting).toHaveStyle({ display: "none" }));
  act(() => d.store.set(timelineOpenAtom, true));
  await waitFor(() => expect(screen.getByRole("region", { name: "Timeline" })).toBeVisible());
  expect(app).toHaveBeenCalledTimes(parent);
  expect(canvas).toHaveBeenCalledTimes(canvasCount);
  expect(inspector).toHaveBeenCalledTimes(inspectorCount);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  const count = dock.mock.calls.length;
  const transport = createMotionTransport(d.engine);
  act(() => {
    for (let value = 1; value <= 60; value++) transport.seek({ value, rate: 60 });
  });
  expect(dock).toHaveBeenCalledTimes(count);
  view.unmount();
});

test("keeps at most one retained scope and purges it on project/artboard change", () => {
  reduced = true;
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({
    type: "addPage",
    page: createPage({ id: "second", layers: [createLayer("rectangle", { id: "second-item" })] }),
  });
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.setPage(d.page.id);
  const before = d.engine.getSnapshot().project;
  d.mount(<MotionTimelineDock engine={d.engine} />);
  const surface = document.querySelector(".motion-timeline-dock"),
    panel = screen.getByRole("region", { name: "Timeline" });
  act(() => d.engine.setPage("second"));
  expect(document.querySelectorAll(".motion-timeline-dock")).toHaveLength(1);
  expect(document.querySelector(".motion-timeline-dock")).not.toBe(surface);
  expect(screen.getByRole("region", { name: "Timeline" })).not.toBe(panel);
  expect(document.querySelector(".motion-timeline-dock")).toHaveAttribute(
    "data-motion-scope",
    JSON.stringify([before.id, "second"]),
  );
  expect(surface?.isConnected).toBe(false);
  expect(d.engine.getSnapshot().project).toBe(before);
  const replacement = createProject({ id: "replacement", pages: [createPage({ id: "second" })] });
  act(() => d.engine.load(replacement));
  expect(document.querySelectorAll(".motion-timeline-dock").length).toBeLessThanOrEqual(1);
});

test("close restores canvas-toggle focus, reduced motion stays immediate and Static pauses playback without deleting keys", async () => {
  reduced = true;
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.mount(
    <>
      <button className="canvas-timeline-toggle">Timeline toggle</button>
      <MotionTimelineDock engine={d.engine} />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Fermer la timeline" }));
  expect(d.store.get(timelineOpenAtom)).toBe(false);
  expect(screen.getByRole("button", { name: "Timeline toggle" })).toHaveFocus();
  await waitFor(() =>
    expect(document.querySelector(".motion-timeline-dock")).toHaveStyle({ display: "none" }),
  );
  act(() => d.store.set(timelineOpenAtom, true));
  const transport = createMotionTransport(d.engine),
    pause = vi.spyOn(transport, "pause");
  const motion = d.engine.getSnapshot().project.pages[0]!.motion!;
  act(() => d.engine.execute({ type: "setCompositionMode", mode: "static" }));
  expect(pause).toHaveBeenCalled();
  expect(d.engine.getSnapshot().project.pages[0]!.motion!.tracks).toEqual(motion.tracks);
  await waitFor(() =>
    expect(document.querySelector(".motion-timeline-dock")).toHaveStyle({ display: "none" }),
  );
  act(() => d.engine.execute({ type: "setCompositionMode", mode: "motion" }));
  expect(screen.getByRole("region", { name: "Timeline" })).toBeVisible();
});

test("lazy-mounts once, retains DOM/zoom across hide/reveal and disconnects hidden subscriptions/observers", async () => {
  reduced = true;
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.store.set(timelineOpenAtom, false);
  const source = createMotionTransport(d.engine),
    subscribe = source.subscribe;
  let activeSubscriptions = 0;
  vi.spyOn(source, "subscribe").mockImplementation((listener) => {
    activeSubscriptions++;
    const stop = subscribe(listener);
    return () => {
      activeSubscriptions--;
      stop();
    };
  });
  const observers = new Set<ResizeObserver>();
  class TrackedResizeObserver extends ResizeObserver {
    private readonly targets = new Set<Element>();
    override observe(target: Element) {
      this.targets.add(target);
      observers.add(this);
      super.observe(target);
    }
    override unobserve(target: Element) {
      this.targets.delete(target);
      if (!this.targets.size) observers.delete(this);
      super.unobserve(target);
    }
    override disconnect() {
      this.targets.clear();
      observers.delete(this);
      super.disconnect();
    }
  }
  vi.stubGlobal("ResizeObserver", TrackedResizeObserver);
  const view = d.mount(<MotionTimelineDock engine={d.engine} />);
  expect(document.querySelector(".motion-timeline-dock")).toBeNull();
  act(() => d.store.set(timelineOpenAtom, true));
  const panel = screen.getByRole("region", { name: "Timeline" }),
    surface = panel.parentElement!;
  const slider = screen.getByRole("slider", { name: "Zoom de la timeline" });
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(slider).toHaveAttribute("aria-valuenow", "130");
  expect(activeSubscriptions).toBeGreaterThan(0);
  expect(observers.size).toBeGreaterThan(0);
  act(() => d.store.set(timelineOpenAtom, false));
  await waitFor(() => expect(surface).toHaveStyle({ display: "none" }));
  expect(activeSubscriptions).toBe(0);
  expect(observers.size).toBe(0);
  act(() => d.engine.execute({ type: "renameProject", name: "Edit while hidden" }));
  expect(activeSubscriptions).toBe(0);
  act(() => d.store.set(timelineOpenAtom, true));
  expect(screen.getByRole("region", { name: "Timeline" })).toBe(panel);
  expect(screen.getByRole("slider", { name: "Zoom de la timeline" })).toBe(slider);
  expect(slider).toHaveAttribute("aria-valuenow", "130");
  expect(activeSubscriptions).toBeGreaterThan(0);
  act(() => d.store.set(timelineOpenAtom, false));
  await waitFor(() => expect(surface).toHaveStyle({ display: "none" }));
  act(() =>
    d.engine.load(
      createProject({ id: "replacement-hidden", pages: [createPage({ id: "different" })] }),
    ),
  );
  expect(document.querySelector(".motion-timeline-dock")).toBeNull();
  view.unmount();
  expect(activeSubscriptions).toBe(0);
  expect(observers.size).toBe(0);
});

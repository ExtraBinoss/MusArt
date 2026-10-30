import { Profiler } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { createLayer, createPage, createProject } from "@musart/core";
import { MotionTimelineDock } from "../../../src/components/motion-shell/MotionTimelineDock";
import { timelineOpenAtom } from "../../../src/state/motion/timeline-state";
import { createMotionTransport } from "../../../src/services/motion/transport";
import { setup } from "../../support/ui";

let reduced = true;
vi.mock("motion/react", async (original) => ({
  ...(await original<typeof import("motion/react")>()),
  useReducedMotion: () => reduced,
}));
afterEach(() => {
  reduced = true;
  vi.unstubAllGlobals();
});
const dock = () => document.querySelector(".motion-timeline-dock")!;

test("opens existing Motion in live peek, retains header/DOM and isolates toggle/pin from editor roots", () => {
  const d = setup(),
    app = vi.fn(),
    canvas = vi.fn(),
    inspector = vi.fn();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  function Host() {
    app();
    return (
      <>
        <Profiler id="Canvas" onRender={canvas}>
          <div />
        </Profiler>
        <Profiler id="Inspector" onRender={inspector}>
          <div />
        </Profiler>
        <MotionTimelineDock engine={d.engine} />
      </>
    );
  }
  const view = d.mount(<Host />);
  expect(dock()).toHaveAttribute("data-motion-presence", "peek");
  expect(dock()).toHaveAttribute("data-motion-pinned", "false");
  expect(dock()).toHaveAttribute("data-motion-grip-ready", "false");
  expect(screen.getByRole("button", { name: /^Lire$/ })).toBeEnabled();
  expect(screen.getByRole("slider", { name: "Se déplacer dans la timeline" })).toBeEnabled();
  const panel = screen.getByRole("region", { name: "Timeline" }),
    zoom = screen.getByRole("slider", { name: "Zoom de la timeline" }),
    counts = [app.mock.calls.length, canvas.mock.calls.length, inspector.mock.calls.length];
  act(() => d.store.set(timelineOpenAtom, true));
  expect(dock()).toHaveAttribute("data-motion-expanded", "true");
  expect(dock()).toHaveAttribute("data-motion-pinned", "false");
  fireEvent.keyDown(zoom, { key: "ArrowRight" });
  expect(zoom).toHaveAttribute("aria-valuenow", "130");
  fireEvent.click(screen.getByRole("button", { name: "Épingler la timeline" }));
  expect(dock()).toHaveAttribute("data-motion-pinned", "true");
  fireEvent.click(screen.getByRole("button", { name: "Désépingler la timeline" }));
  expect(dock()).toHaveAttribute("data-motion-pinned", "false");
  act(() => d.store.set(timelineOpenAtom, false));
  expect(dock()).toHaveAttribute("data-motion-presence", "peek");
  expect(screen.getByRole("region", { name: "Timeline" })).toBe(panel);
  expect(screen.getByRole("slider", { name: "Zoom de la timeline" })).toBe(zoom);
  expect(zoom).toHaveAttribute("aria-valuenow", "130");
  expect([app.mock.calls.length, canvas.mock.calls.length, inspector.mock.calls.length]).toEqual(
    counts,
  );
  view.unmount();
});

test("clock ticks keep the peek controls live without React commits in the shell", () => {
  const d = setup(),
    commits = vi.fn();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const view = d.mount(
    <Profiler id="Dock" onRender={commits}>
      <MotionTimelineDock engine={d.engine} />
    </Profiler>,
  );
  const before = commits.mock.calls.length;
  const transport = createMotionTransport(d.engine);
  act(() => {
    for (let value = 1; value <= 60; value++) transport.seek({ value, rate: 60 });
  });
  expect(commits).toHaveBeenCalledTimes(before);
  expect(dock()).toHaveAttribute("data-motion-presence", "peek");
  view.unmount();
});

test("only a successful canonical Static to Motion switch auto-pins, and each later switch repeats it", () => {
  const d = setup();
  d.mount(<MotionTimelineDock engine={d.engine} />);
  expect(document.querySelector(".motion-timeline-dock")).toBeNull();
  const before = d.engine.getSnapshot();
  act(() =>
    expect(() =>
      d.engine.execute({ type: "setMotionDuration", duration: { value: 0, rate: 1 } }),
    ).toThrow(),
  );
  expect(d.engine.getSnapshot()).toBe(before);
  expect(document.querySelector(".motion-timeline-dock")).toBeNull();
  act(() => d.engine.execute({ type: "setCompositionMode", mode: "motion" }));
  expect(dock()).toHaveAttribute("data-motion-pinned", "true");
  expect(dock()).toHaveAttribute("data-motion-expanded", "true");
  fireEvent.click(screen.getByRole("button", { name: "Désépingler la timeline" }));
  const motion = d.engine.getSnapshot().project.pages[0]!.motion!;
  const pause = vi.spyOn(createMotionTransport(d.engine), "pause");
  act(() => d.engine.execute({ type: "setCompositionMode", mode: "static" }));
  expect(pause).toHaveBeenCalled();
  expect(document.querySelector(".motion-timeline-dock")).toBeNull();
  expect(d.engine.getSnapshot().project.pages[0]!.motion!.tracks).toEqual(motion.tracks);
  act(() => d.engine.execute({ type: "setCompositionMode", mode: "motion" }));
  expect(dock()).toHaveAttribute("data-motion-pinned", "true");
});

test("keeps only Pin in the header and lets the persistent canvas toggle dismiss a pinned dock", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.mount(
    <>
      <button className="canvas-timeline-toggle">Timeline toggle</button>
      <MotionTimelineDock engine={d.engine} />
    </>,
  );
  expect(screen.queryByRole("button", { name: "Ouvrir la timeline" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Fermer la timeline" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Épingler la timeline" }));
  act(() => d.store.set(timelineOpenAtom, false));
  expect(d.store.get(timelineOpenAtom)).toBe(false);
  expect(dock()).toHaveAttribute("data-motion-presence", "peek");
  expect(dock()).toHaveAttribute("data-motion-pinned", "false");
  expect(screen.getByRole("button", { name: "Timeline toggle" })).toHaveFocus();
  act(() => d.store.set(timelineOpenAtom, true));
  expect(dock()).toHaveAttribute("data-motion-expanded", "true");
});

test("retains at most one scope, remembers its pin choice and cleans subscriptions/observers on unmount", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({
    type: "addPage",
    page: createPage({ id: "second", layers: [createLayer("rectangle", { id: "second-item" })] }),
  });
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.setPage(d.page.id);
  const source = createMotionTransport(d.engine),
    subscribe = source.subscribe;
  let subscriptions = 0;
  vi.spyOn(source, "subscribe").mockImplementation((listener) => {
    subscriptions++;
    const stop = subscribe(listener);
    return () => {
      subscriptions--;
      stop();
    };
  });
  const disconnect = vi.spyOn(ResizeObserver.prototype, "disconnect");
  const view = d.mount(<MotionTimelineDock engine={d.engine} />);
  const first = dock();
  fireEvent.click(screen.getByRole("button", { name: "Épingler la timeline" }));
  const project = d.engine.getSnapshot().project;
  act(() => d.engine.setPage("second"));
  expect(document.querySelectorAll(".motion-timeline-dock")).toHaveLength(1);
  expect(first.isConnected).toBe(false);
  expect(dock()).toHaveAttribute("data-motion-presence", "peek");
  act(() => d.engine.setPage(d.page.id));
  expect(dock()).toHaveAttribute("data-motion-pinned", "true");
  expect(d.engine.getSnapshot().project).toBe(project);
  expect(subscriptions).toBeGreaterThan(0);
  act(() =>
    d.engine.load(createProject({ id: "replacement", pages: [createPage({ id: "different" })] })),
  );
  expect(document.querySelector(".motion-timeline-dock")).toBeNull();
  expect(subscriptions).toBe(0);
  expect(disconnect).toHaveBeenCalled();
  view.unmount();
});

test("reverses animated entry/exit without removing the interactive header", async () => {
  reduced = false;
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const view = d.mount(<MotionTimelineDock engine={d.engine} />);
  const panel = screen.getByRole("region", { name: "Timeline" });
  act(() => d.store.set(timelineOpenAtom, true));
  act(() => d.store.set(timelineOpenAtom, false));
  act(() => d.store.set(timelineOpenAtom, true));
  await waitFor(() => expect(dock()).toHaveAttribute("data-motion-body-hidden", "false"));
  expect(dock()).toHaveAttribute("data-motion-animating", "true");
  expect(dock()).toHaveAttribute("data-motion-grip-ready", "false");
  expect(screen.getByRole("region", { name: "Timeline" })).toBe(panel);
  expect(dock()).not.toHaveAttribute("inert");
  await waitFor(() => expect(dock()).not.toHaveAttribute("data-motion-animating"));
  expect(dock()).toHaveAttribute("data-motion-grip-ready", "true");
  view.unmount();
});

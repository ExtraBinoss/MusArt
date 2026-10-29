import { Profiler } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createLayer } from "@musart/core";
import { setup } from "../../support/ui";
import { makeTransport, PanelHost, pointer } from "./support";
import { TimelinePanel } from "../../../src/components/motion/TimelinePanel";
import { choose } from "../../support/select";

it("updates time/playhead imperatively without timeline React commits, then cleans subscriptions", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!),
    commits = vi.fn(),
    close = vi.fn();
  const view = d.mount(
    <Profiler id="timeline" onRender={commits}>
      <PanelHost engine={d.engine} transport={runtime.transport} onClose={close} />
    </Profiler>,
  );
  const before = commits.mock.calls.length,
    snapshot = d.engine.getSnapshot();
  act(() => {
    for (let value = 1; value <= 60; value++) runtime.update({ time: { value, rate: 60 } });
  });
  expect(commits.mock.calls.length).toBe(before);
  expect(screen.getByRole("spinbutton", { name: "Temps actuel" })).toHaveValue(1000);
  expect(document.querySelector(".motion-playhead")).toHaveStyle({
    transform: "translateX(120px)",
  });
  expect(d.engine.getSnapshot()).toBe(snapshot);
  fireEvent.click(screen.getByRole("button", { name: "Fermer la timeline" }));
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  expect(runtime.listeners.size).toBe(0);
});

it("keeps mounted rows bounded and provides functional hierarchy, zoom and resize controls", () => {
  const d = setup();
  d.engine.execute({
    type: "addLayers",
    layers: Array.from({ length: 150 }, (_, index) =>
      createLayer("rectangle", { name: `Extra ${index}` }),
    ),
  });
  const snapshot = d.engine.getSnapshot();
  const ids = snapshot.project.pages[0]!.layers.map((layer) => layer.id).sort();
  d.engine.execute({
    type: "setCompositionMode",
    mode: "motion",
    plan: {
      compositionId: snapshot.pageId,
      revision: snapshot.revision,
      layerIds: ids,
      duration: { value: 2, rate: 1 },
      frameRate: { numerator: 30, denominator: 1 },
      requiresConfirmation: true,
    },
    confirmed: true,
  });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  d.mount(<PanelHost engine={d.engine} transport={runtime.transport} />);
  expect(document.querySelectorAll(".motion-row").length).toBeLessThan(30);
  fireEvent.click(screen.getByRole("button", { name: "Replier tous les calques" }));
  expect(screen.getByRole("button", { name: "Déplier tous les calques" })).toBeVisible();
  const zoom = screen.getByRole("slider", { name: "Zoom de la timeline" });
  fireEvent.keyDown(zoom, { key: "ArrowRight" });
  expect(zoom).toHaveAttribute("aria-valuenow", "130");
  const resize = screen.getByRole("separator", { name: "Redimensionner la timeline" });
  fireEvent.keyDown(resize, { key: "ArrowUp" });
  expect(screen.getByRole("region", { name: "Timeline" })).toHaveStyle({ height: "266px" });
  act(() => pointer(resize, "pointerdown", 0, 400));
  act(() => pointer(resize, "pointermove", 0, 350));
  expect(screen.getByRole("region", { name: "Timeline" })).toHaveStyle({ height: "316px" });
  act(() => pointer(resize, "pointercancel", 0, 350));
  expect(screen.getByRole("region", { name: "Timeline" })).toHaveStyle({ height: "266px" });
});

it("wires visible track gestures to the real core and keeps pointer moves out of React/history", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!),
    commits = vi.fn();
  d.mount(
    <Profiler id="timeline" onRender={commits}>
      <PanelHost engine={d.engine} transport={runtime.transport} />
    </Profiler>,
  );
  const track = screen.getByRole("button", { name: "Intervalle actif de Rectangle bleu" });
  act(() => pointer(track, "pointerdown", 100));
  const afterStart = commits.mock.calls.length,
    before = d.engine.getSnapshot();
  act(() => {
    pointer(track, "pointermove", 120);
    pointer(track, "pointermove", 140);
    pointer(track, "pointermove", 160);
  });
  expect(commits.mock.calls.length).toBe(afterStart);
  expect(d.engine.getSnapshot()).toBe(before);
  expect(track.closest(".motion-row")?.getAttribute("style")).toContain("--motion-drag-x: 60px");
  act(() => pointer(track, "pointerup", 160));
  const moved = d.engine
    .getSnapshot()
    .project.pages[0]!.motion!.tracks.find((item) => item.layerId === d.rectangle.id)!;
  expect(moved.start).toEqual({ value: 1, rate: 2 });
  expect(d.engine.getSnapshot().revision).toBe(before.revision + 1);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toBe(before.project);
});

it("implements verified Space playback in timeline focus while preserving field input", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  d.mount(<PanelHost engine={d.engine} transport={runtime.transport} />);
  fireEvent.keyDown(screen.getByRole("slider", { name: "Se déplacer dans la timeline" }), {
    key: " ",
  });
  expect(runtime.transport.play).toHaveBeenCalledOnce();
  fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Temps actuel" }), { key: " " });
  expect(runtime.transport.pause).not.toHaveBeenCalled();
});

it("keeps portalled easing clicks and select items out of timeline marquee and key handling", async () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const value of [0, 1])
    d.engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: d.rectangle.id, property: "x" },
      time: { value, rate: 1 },
      value,
    });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  d.mount(<PanelHost engine={d.engine} transport={runtime.transport} />);
  fireEvent.click(screen.getByRole("button", { name: /Modifier l’interpolation vers/ }));
  const before = d.engine.getSnapshot();
  const blank = screen.getByText("Contrôle la transition vers cette image clé.");
  act(() => pointer(blank, "pointerdown", 500, 30));
  act(() => pointer(blank, "pointerup", 500, 30));
  expect(document.querySelector(".motion-marquee")).toBeNull();
  expect(screen.getByRole("dialog", { name: "Interpolation" })).toBeVisible();
  await choose("Courbe d’interpolation", "Accélération");
  expect(screen.getByRole("combobox", { name: "Courbe d’interpolation" })).toHaveTextContent(
    "Accélération",
  );
  expect(screen.getByRole("dialog", { name: "Interpolation" })).toBeVisible();
  fireEvent.keyDown(blank, { key: "Delete" });
  expect(d.engine.getSnapshot()).toBe(before);
});

it("keeps ruler, clipped line and automatic playback scrolling on the same time scale", () => {
  // Viewport dimensions are measured on mount/ResizeObserver, never on transport ticks.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({ type: "setMotionDuration", duration: { value: 10, rate: 1 } });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  d.mount(<PanelHost engine={d.engine} transport={runtime.transport} />);
  const viewport = document.querySelector<HTMLElement>(".motion-timeline-scroll")!;
  Object.defineProperties(viewport, { clientWidth: { value: 500 }, scrollWidth: { value: 3000 } });
  act(() => runtime.update({ time: { value: 4, rate: 1 }, playing: true, playbackMode: "loop" }));
  expect(viewport.scrollLeft).toBe(372);
  expect(document.querySelector(".motion-playhead-clip")).toHaveStyle({
    left: "616px",
    width: "256px",
  });
  expect(document.querySelector(".motion-playhead")).toHaveStyle({
    transform: "translateX(108px)",
  });
  expect(document.querySelector(".motion-ruler-playhead")).toHaveStyle({
    transform: "translateX(480px)",
  });
  act(() => runtime.update({ time: { value: 9, rate: 1 } }));
  expect(viewport.scrollLeft).toBe(972);
  act(() => runtime.update({ time: { value: 0, rate: 1 } }));
  expect(viewport.scrollLeft).toBe(0);
  expect(document.querySelector(".motion-playhead")).toHaveStyle({ transform: "translateX(0px)" });
  act(() => runtime.update({ playing: false }));
  viewport.scrollLeft = 100;
  fireEvent.scroll(viewport);
  expect(viewport.scrollLeft).toBe(100);
  expect(document.querySelector(".motion-playhead")).toHaveStyle({ visibility: "hidden" });
  act(() => runtime.update({ time: { value: 1, rate: 1 } }));
  expect(document.querySelector(".motion-playhead")).toHaveStyle({ transform: "translateX(20px)" });
  expect(viewport.scrollLeft).toBe(100);
  act(() => runtime.update({ time: runtime.transport.read().duration }));
  expect(document.querySelector(".motion-playhead")).toHaveAttribute("data-at-end", "true");
});

it("retires an easing portal and pending input drafts when the dock exits", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const value of [0, 1])
    d.engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: d.rectangle.id, property: "x" },
      time: { value, rate: 1 },
      value,
    });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  const render = (active: boolean) => (
    <TimelinePanel
      engine={d.engine}
      snapshot={d.engine.getSnapshot()}
      transport={runtime.transport}
      active={active}
      onClose={vi.fn()}
    />
  );
  const view = d.mount(render(true));
  fireEvent.click(screen.getByRole("button", { name: /Modifier l’interpolation vers/ }));
  expect(screen.getByRole("dialog", { name: "Interpolation" })).toBeVisible();
  const before = d.engine.getSnapshot();
  view.rerender(render(false));
  expect(screen.queryByRole("dialog", { name: "Interpolation" })).toBeNull();
  expect(screen.getByRole("spinbutton", { name: "Durée de composition" })).toBeDisabled();
  expect(d.engine.getSnapshot()).toBe(before);
});

it("coalesces raw wheel zoom packets into one frame and cancels queued work on unmount", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!),
    commits = vi.fn();
  const view = d.mount(
    <Profiler id="timeline" onRender={commits}>
      <PanelHost engine={d.engine} transport={runtime.transport} />
    </Profiler>,
  );
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const canceled = vi.spyOn(globalThis, "cancelAnimationFrame");
  const viewport = document.querySelector<HTMLElement>(".motion-timeline-scroll")!;
  const before = commits.mock.calls.length,
    snapshot = d.engine.getSnapshot();
  act(() => {
    for (let packet = 0; packet < 20; packet++)
      fireEvent.wheel(viewport, { ctrlKey: true, deltaY: -1, clientX: 500 });
  });
  expect(frames).toHaveLength(1);
  expect(commits.mock.calls.length).toBe(before);
  act(() => frames[0]!(16));
  expect(
    Number(
      screen.getByRole("slider", { name: "Zoom de la timeline" }).getAttribute("aria-valuenow"),
    ),
  ).toBeGreaterThan(120);
  expect(d.engine.getSnapshot()).toBe(snapshot);
  fireEvent.wheel(viewport, { ctrlKey: true, deltaY: -1, clientX: 500 });
  view.unmount();
  expect(canceled).toHaveBeenCalledWith(2);
});

it("selects property keys collectively and deletes only those keys in one transaction", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const value of [0, 1])
    d.engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: d.rectangle.id, property: "x" },
      time: { value, rate: 1 },
      value,
    });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  d.mount(<PanelHost engine={d.engine} transport={runtime.transport} />);
  const label = screen.getByRole("button", {
    name: "Sélectionner toutes les images clés de Position X",
  });
  fireEvent.click(label);
  expect(document.querySelectorAll(".motion-key.is-key-selected")).toHaveLength(2);
  const before = d.engine.getSnapshot().project.pages[0]!.layers;
  const transactions = vi.spyOn(d.engine, "transaction");
  fireEvent.keyDown(label, { key: "Delete" });
  expect(transactions).toHaveBeenCalledOnce();
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toEqual(before);
  expect(document.querySelectorAll(".motion-key")).toHaveLength(0);
  const bubble = vi.fn();
  window.addEventListener("keydown", bubble);
  fireEvent.keyDown(label, { key: "Delete" });
  expect(bubble).not.toHaveBeenCalled();
  window.removeEventListener("keydown", bubble);
});

it("cancels an in-progress track gesture immediately when the dock becomes inactive", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  const view = d.mount(
    <TimelinePanel
      engine={d.engine}
      snapshot={d.engine.getSnapshot()}
      transport={runtime.transport}
      onClose={vi.fn()}
    />,
  );
  const track = screen.getByRole("button", { name: "Intervalle actif de Rectangle bleu" });
  const before = d.engine.getSnapshot().project;
  act(() => pointer(track, "pointerdown", 100));
  act(() => pointer(track, "pointermove", 160));
  expect(track.closest(".motion-row")?.getAttribute("style")).toContain("--motion-drag-x: 60px");
  view.rerender(
    <TimelinePanel
      engine={d.engine}
      snapshot={d.engine.getSnapshot()}
      transport={runtime.transport}
      active={false}
      onClose={vi.fn()}
    />,
  );
  expect(track.closest(".motion-row")?.getAttribute("style")).not.toContain("--motion-drag-x");
  act(() => pointer(track, "pointerup", 160));
  expect(d.engine.getSnapshot().project).toBe(before);
});

it("does not read scroll layout from transport frame subscriptions", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  d.mount(<PanelHost engine={d.engine} transport={runtime.transport} />);
  const viewport = document.querySelector<HTMLElement>(".motion-timeline-scroll")!;
  const read = vi.fn(() => 72);
  Object.defineProperty(viewport, "scrollLeft", { configurable: true, get: read, set: vi.fn() });
  fireEvent.scroll(viewport);
  read.mockClear();
  act(() => {
    for (let value = 1; value <= 60; value++)
      runtime.update({ playing: true, time: { value, rate: 60 } });
  });
  expect(read).not.toHaveBeenCalled();
});

it("compact mobile timeline uses one gutter for layout and gesture geometry", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const snapshot = d.engine.getSnapshot();
  const runtime = makeTransport(snapshot.project.pages[0]!);
  const view = d.mount(
    <TimelinePanel
      compact
      engine={d.engine}
      snapshot={snapshot}
      transport={runtime.transport}
      onClose={vi.fn()}
    />,
  );
  const panel = view.container.querySelector<HTMLElement>(".motion-timeline")!;
  expect(panel.style.getPropertyValue("--motion-gutter")).toBe("120px");
  expect(panel.style.height).toBe("");
  expect(panel).toHaveAttribute("data-compact", "true");
  expect(view.container.querySelector(".motion-compact-toolbar")).toContainElement(
    screen.getByRole("spinbutton", { name: "Temps actuel" }),
  );
  expect(view.container.querySelector(".motion-ruler-label")).not.toContainElement(
    screen.getByRole("spinbutton", { name: "Temps actuel" }),
  );
  expect(view.container.querySelector(".motion-compact-zoom")).toContainElement(
    screen.getByRole("slider", { name: "Zoom de la timeline" }),
  );
  expect(view.container.querySelector(".motion-row")).toHaveStyle({ height: "32px" });
  const area = view.container.querySelector<HTMLElement>(".motion-row-space")!;
  act(() => pointer(area, "pointerdown", 110, 50));
  expect(area.querySelector(".motion-marquee")).toBeNull();
  act(() => pointer(area, "pointerdown", 130, 50));
  act(() => pointer(area, "pointermove", 190, 82));
  expect(area.querySelector(".motion-marquee")).toHaveStyle({
    left: "130px",
    width: "60px",
    height: "32px",
  });
  expect(area.querySelector(".motion-marquee")).not.toBeNull();
  act(() => pointer(area, "pointercancel", 180, 50));
  expect(area.querySelector(".motion-marquee")).toBeNull();
  view.unmount();
  expect(runtime.listeners.size).toBe(0);
});

it("uses the full mobile time area for playback following without a hidden desktop action gutter", () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(390);
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.execute({ type: "setMotionDuration", duration: { value: 10, rate: 1 } });
  const runtime = makeTransport(d.engine.getSnapshot().project.pages[0]!);
  d.mount(
    <TimelinePanel
      compact
      engine={d.engine}
      snapshot={d.engine.getSnapshot()}
      transport={runtime.transport}
      onClose={vi.fn()}
    />,
  );
  const viewport = document.querySelector<HTMLElement>(".motion-timeline-scroll")!;
  act(() => runtime.update({ time: { value: 4, rate: 1 }, playing: true, playbackMode: "loop" }));
  expect(viewport.scrollLeft).toBe(258);
  expect(document.querySelector(".motion-playhead-clip")).toHaveStyle({
    left: "378px",
    width: "270px",
  });
  expect(document.querySelector(".motion-playhead")).toHaveStyle({
    transform: "translateX(222px)",
  });
  expect(document.querySelector(".motion-scroll-shadow")).toHaveAttribute(
    "data-scroll-axis",
    "both",
  );
  expect(document.querySelector(".motion-timeline-actions")).toBeNull();
});

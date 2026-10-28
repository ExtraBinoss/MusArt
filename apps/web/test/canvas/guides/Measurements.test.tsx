import { expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { createStore } from "jotai";
import { createLayer, createPage, createProject, EditorEngine, SnapIndex } from "@musart/core";
import { Measurements } from "../../../src/canvas/guides/Measurements";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { createPreviewSource } from "../../../src/state/session/preview-source";
import { SnapFeedback } from "../../../src/canvas/interaction/snapping/source";
import { captureGestureOrigin } from "../../../src/canvas/interaction/gesture-origin";
import { createPlaybackSource } from "../../../src/canvas/session/playback-source";
function fixture() {
  const layer = createLayer("rectangle", {
    id: "moving",
    x: 20,
    y: 20,
    width: 40,
    height: 40,
    margin: { top: 8, right: 8, bottom: 8, left: 8 },
    padding: { top: 4, right: 4, bottom: 4, left: 4 },
  });
  const target = createLayer("rectangle", { id: "target", x: 200, y: 100, width: 80, height: 60 });
  const page = createPage({
    width: 1000,
    height: 800,
    layers: [layer, target],
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
  });
  const engine = new EditorEngine(createProject({ pages: [page] })),
    controller = new SceneController(engine, createPreviewSource(createStore())),
    snapping = new SnapFeedback(engine);
  const cues = new SnapIndex(page, [layer.id]).snap(
    { x: 157, y: 12, width: 40, height: 40 },
    4,
  ).cues;
  return { layer, page, engine, controller, snapping, cues };
}
it("hides idle padding/distance labels and only draws an actual engaged snap at constant screen dimensions", () => {
  const d = fixture(),
    { container } = render(
      <Measurements
        controller={d.controller}
        selected={[d.layer.id]}
        snapping={d.snapping}
        zoom={2}
      />,
    ),
    svg = container.querySelector("svg")!;
  expect(svg).toHaveAttribute("viewBox", "0 0 1000 800");
  expect(svg).toBeEmptyDOMElement();
  act(() => d.snapping.set(captureGestureOrigin(d.engine), d.cues));
  expect(svg.querySelector(".canvas-snap-line")).toHaveAttribute("data-snap-target", "target");
  expect(svg.querySelector(".canvas-snap-line")).toHaveAttribute("stroke-width", "0.5");
  expect(svg.querySelector(".canvas-snap-gap")).toHaveAttribute("marker-start");
  expect(svg.querySelector("text")).toHaveTextContent("50");
  expect(svg.querySelector(".canvas-measurement-label")).toHaveAttribute(
    "transform",
    expect.stringContaining("scale(0.5)"),
  );
  expect(svg.querySelector(".measurement-label-background")).toHaveAttribute("height", "19");
  act(() => d.snapping.clear());
  expect(svg).toBeEmptyDOMElement();
});
it("updates imperatively for snapping, preview and zoom, retaining readable text without React commits", () => {
  const d = fixture();
  let zoom = 1,
    notify = () => {},
    renders = 0;
  const stop = vi.fn(),
    view = {
      read: () => ({ x: 0, y: 0, zoom }),
      subscribe: (listener: () => void) => {
        notify = listener;
        return stop;
      },
    };
  function Probe() {
    renders++;
    return (
      <Measurements controller={d.controller} snapping={d.snapping} viewSource={view} zoom={1} />
    );
  }
  const baseline = d.engine.getSnapshot(),
    { container, unmount } = render(<Probe />);
  act(() => d.snapping.set(captureGestureOrigin(d.engine), d.cues));
  act(() => d.controller.setGesture([{ layerId: d.layer.id, patch: { x: 160 } }]));
  act(() => {
    zoom = 4;
    notify();
  });
  expect(container.querySelector(".canvas-snap-line")).toHaveAttribute("stroke-width", "0.25");
  expect(container.querySelector("text")).toHaveAttribute("font-size", "11");
  expect(renders).toBe(1);
  expect(d.engine.getSnapshot()).toBe(baseline);
  unmount();
  expect(stop).toHaveBeenCalledOnce();
  act(() => {
    notify();
    d.snapping.clear();
  });
});
it("suppresses stale project/page/revision and playback cues and respects guide colors without distance noise", () => {
  const d = fixture(),
    { container } = render(
      <Measurements controller={d.controller} snapping={d.snapping} zoom={1} />,
    ),
    origin = captureGestureOrigin(d.engine);
  act(() =>
    d.snapping.set(origin, [
      {
        axis: "x",
        position: 3,
        from: { x: 3, y: 0 },
        to: { x: 3, y: 10 },
        kind: "guide",
        targetId: "manual",
        color: "#ff00aa",
      },
    ]),
  );
  expect(container.querySelector("line")).toHaveAttribute("stroke", "#ff00aa");
  expect(container.querySelector("text")).toBeNull();
  const playback = createPlaybackSource(d.engine);
  act(() => playback.set({ page: d.page, assets: {} }));
  expect(container.querySelector("svg")).toBeEmptyDOMElement();
  act(() => playback.set(null));
  expect(container.querySelector("line")).not.toBeNull();
  act(() => d.engine.execute({ type: "renameProject", name: "Changed" }));
  expect(container.querySelector("svg")).toBeEmptyDOMElement();
  act(() => d.engine.load(createProject({ pages: [createPage({ id: "other" })] })));
  expect(container.querySelector("svg")).toBeEmptyDOMElement();
});

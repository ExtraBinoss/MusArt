import { expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import { createStore } from "jotai";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getWorldMatrix,
  measureLayer,
} from "@musart/core";
import { Measurements } from "../../../src/canvas/guides/Measurements";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { createPreviewSource } from "../../../src/state/session/preview-source";
import { previewAtom } from "../../../src/state/session/editor";
import { createPlaybackSource } from "../../../src/canvas/session/playback-source";
function fixture() {
  const group = createLayer("group", {
      id: "group",
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      rotation: 90,
      padding: { top: 2, right: 3, bottom: 4, left: 5 },
    }),
    layer = createLayer("rectangle", {
      id: "selected",
      parentId: group.id,
      x: 12,
      y: 14,
      width: 30,
      height: 20,
      padding: { top: 1, right: 2, bottom: 3, left: 4 },
      margin: { top: 2, right: 3, bottom: 4, left: 5 },
    }),
    other = createLayer("rectangle", { id: "other", visible: false }),
    page = createPage({
      width: 200,
      height: 160,
      layers: [group, layer, other],
      margins: { top: 10, right: 12, bottom: 14, left: 16 },
    }),
    engine = new EditorEngine(createProject({ pages: [page] })),
    store = createStore(),
    controller = new SceneController(engine, createPreviewSource(store));
  return { group, layer, other, page, engine, store, controller };
}
it("uses world transforms, true margin/padding boxes and parent spacing arrows at constant screen stroke", () => {
  const d = fixture(),
    { container } = render(
      <Measurements controller={d.controller} selected={[d.layer.id]} zoom={2} />,
    ),
    svg = container.querySelector("svg")!;
  expect(svg).toHaveAttribute("viewBox", "0 0 200 160");
  const rects = svg.querySelectorAll("rect");
  expect(rects[0]).toHaveAttribute("x", "16");
  expect(rects[0]).toHaveAttribute("width", "172");
  expect(rects[0]).toHaveAttribute("height", "136");
  expect(rects[0]).toHaveAttribute("stroke-width", "0.5");
  expect(rects[1]).toHaveAttribute("x", "-5");
  expect(rects[1]).toHaveAttribute("width", "38");
  expect(rects[2]).toHaveAttribute("x", "4");
  expect(rects[2]).toHaveAttribute("width", "24");
  expect(rects[1]!.parentElement).toHaveAttribute(
    "transform",
    `matrix(${getWorldMatrix(d.page, d.layer.id).join(" ")})`,
  );
  const arrows = measureLayer(d.page, d.layer.id).arrows,
    lines = svg.querySelectorAll("line");
  expect(lines).toHaveLength(4);
  arrows.forEach((arrow, index) => {
    expect(Number(lines[index]!.getAttribute("x1"))).toBeCloseTo(arrow.from.x);
    expect(Number(lines[index]!.getAttribute("y2"))).toBeCloseTo(arrow.to.y);
  });
  expect([...svg.querySelectorAll("text")].map((node) => node.textContent)).toEqual(
    arrows.map((arrow) => String(arrow.value)),
  );
  const label = svg.querySelector(".canvas-measurement-label")!;
  expect(label.getAttribute("transform")).toContain("scale(0.5)");
  expect(label.querySelector("rect")).toHaveAttribute("height", "18");
  expect(label.querySelector("text")).toHaveAttribute("font-size", "11");
  expect(label.querySelector("text")).toHaveAttribute("font-weight", "600");
  expect(label.querySelector("text")).not.toHaveAttribute("stroke");
  expect(label.querySelector("text")).not.toHaveAttribute("paint-order");
});
it("subscribes imperatively to previews and playback without rerendering React or committing history", () => {
  const d = fixture();
  let renders = 0;
  function Probe() {
    renders++;
    return <Measurements controller={d.controller} selected={[d.layer.id]} zoom={1} />;
  }
  const baseline = d.engine.getSnapshot(),
    { container, unmount } = render(<Probe />);
  act(() =>
    d.store.set(previewAtom, { target: "layer", layerId: d.layer.id, patch: { width: 50 } }),
  );
  expect(container.querySelectorAll("rect")[2]).toHaveAttribute("width", "44");
  expect(renders).toBe(1);
  expect(d.engine.getSnapshot()).toBe(baseline);
  const playback = createPlaybackSource(d.engine);
  act(() => playback.set({ page: { ...d.page, width: 300 }, assets: {} }));
  expect(container.querySelector("svg")).toBeEmptyDOMElement();
  act(() => playback.set(null));
  expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 200 160");
  act(() => d.store.set(previewAtom, null));
  expect(container.querySelectorAll("rect")[2]).toHaveAttribute("width", "24");
  expect(renders).toBe(1);
  unmount();
  act(() => d.controller.setGesture([{ layerId: d.layer.id, patch: { height: 60 } }]));
  expect(d.engine.getSnapshot()).toBe(baseline);
});
it("omits arrows for multi-selection, invisible layers and zero spacing while clipping exhausted boxes", () => {
  const d = fixture();
  const blank = createLayer("rectangle", {
      id: "blank",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      padding: { top: 5, right: 5, bottom: 5, left: 5 },
    }),
    page = createPage({ width: 40, height: 40, layers: [blank, d.other] });
  d.engine.load(createProject({ pages: [page] }));
  const { container, rerender } = render(
    <Measurements controller={d.controller} selected={[blank.id, d.other.id]} zoom={1} />,
  );
  expect(container.querySelectorAll("line")).toHaveLength(0);
  expect(container.querySelector("rect")).toHaveAttribute("width", "0");
  rerender(<Measurements controller={d.controller} selected={[blank.id]} zoom={1} />);
  expect(container.querySelectorAll("line")).toHaveLength(2);
  rerender(<Measurements controller={d.controller} selected={[]} zoom={1} />);
  expect(container.querySelectorAll("rect")).toHaveLength(0);
});
it("suppresses selected child measurements while its ancestor is hidden", () => {
  const d = fixture(),
    { container } = render(
      <Measurements controller={d.controller} selected={[d.layer.id]} zoom={1} />,
    );
  expect(container.querySelectorAll("line")).toHaveLength(4);
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.group.id], patch: { visible: false } }),
  );
  expect(container.querySelectorAll("line")).toHaveLength(0);
  expect(container.querySelectorAll("rect")).toHaveLength(1);
});

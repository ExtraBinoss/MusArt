import { act, fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { CanvasSelection } from "../../../src/canvas/selection/CanvasSelection";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
import { setup } from "../../support/ui";
import { createTimelineHoverSource } from "../../../src/state/motion/hover";
import { createMotionTransport } from "../../../src/services/motion/transport";

test("selection updates only its decorations, retains handle actions and releases subscriptions", () => {
  const d = setup(),
    controller = new SceneController(d.engine, EMPTY_PREVIEW_SOURCE);
  let view = { x: 0, y: 0, zoom: 1 };
  const stopView = vi.fn();
  const viewSource = { read: () => view, subscribe: vi.fn(() => stopView) };
  const onHandle = vi.fn();
  let renders = 0;
  function CanvasHost({ showHandles = true }) {
    renders++;
    return (
      <CanvasSelection
        engine={d.engine}
        controller={controller}
        viewSource={viewSource}
        viewport={{ current: null }}
        showHandles={showHandles}
        onHandle={onHandle}
      />
    );
  }
  const mount = d.mount(<CanvasHost />);
  act(() => d.engine.select([d.rectangle.id]));
  expect(renders).toBe(1);
  expect(document.querySelectorAll(".canvas-selection")).toHaveLength(1);
  const handle = document.querySelector<HTMLButtonElement>('.canvas-handle[data-handle="nw"]')!;
  expect(handle.dataset.layerId).toBe(d.rectangle.id);
  fireEvent.pointerDown(handle);
  expect(onHandle).toHaveBeenCalledOnce();
  view = { ...view, zoom: 2 };
  act(() => d.engine.select([d.text.id]));
  expect(renders).toBe(1);
  expect(document.querySelector(".canvas-selection")).toHaveAttribute("data-layer-id", d.text.id);
  expect(document.querySelector<HTMLButtonElement>(".canvas-handle")!.style.transform).toBe(
    "scale(0.5)",
  );
  mount.rerender(<CanvasHost showHandles={false} />);
  expect(document.querySelector(".canvas-selection")).toBeNull();
  mount.unmount();
  expect(stopView).toHaveBeenCalled();
});
test("paint-only guide edits remain current across reselects without repainting the canvas host", () => {
  const d = setup();
  d.engine.execute({
    type: "addGuide",
    targetId: d.rectangle.id,
    guide: { id: "color", axis: "x", position: 20, color: "#ff0000" },
  });
  const controller = new SceneController(d.engine, EMPTY_PREVIEW_SOURCE);
  const viewSource = { read: () => ({ x: 0, y: 0, zoom: 1 }), subscribe: () => () => {} };
  d.mount(
    <CanvasSelection
      engine={d.engine}
      controller={controller}
      viewSource={viewSource}
      viewport={{ current: null }}
      showHandles
      onHandle={vi.fn()}
    />,
  );
  act(() => d.engine.select([d.rectangle.id]));
  act(() =>
    d.engine.execute({
      type: "updateGuide",
      targetId: d.rectangle.id,
      id: "color",
      patch: { color: "#00aaff" },
    }),
  );
  act(() => d.engine.select([d.text.id]));
  act(() => d.engine.select([d.rectangle.id]));
  const line = document.querySelector<HTMLElement>('[data-guide-id="color"]');
  expect(line?.style.getPropertyValue("--guide-color")).toBe("#00aaff");
});

test("timeline hover follows evaluated poses and zoom imperatively, stays faint during Play and never selects", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const value of [0, 1])
    d.engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: d.rectangle.id, property: "x" },
      time: { value, rate: 1 },
      value: value * 100,
    });
  const controller = new SceneController(d.engine, EMPTY_PREVIEW_SOURCE),
    hover = createTimelineHoverSource(d.engine),
    transport = createMotionTransport(d.engine),
    listeners = new Set<() => void>();
  let view = { x: 0, y: 0, zoom: 1 },
    renders = 0;
  const viewSource = {
    read: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  function Host() {
    renders++;
    return (
      <CanvasSelection
        engine={d.engine}
        controller={controller}
        viewSource={viewSource}
        viewport={{ current: null }}
        showHandles
        onHandle={vi.fn()}
      />
    );
  }
  const mount = d.mount(<Host />),
    before = d.engine.getSnapshot();
  const clear = hover.show(before.pageId, d.rectangle.id);
  const outline = document.querySelector<HTMLElement>(".canvas-timeline-hover")!;
  expect(outline).toHaveAttribute("data-layer-id", d.rectangle.id);
  expect(outline.style.display).toBe("");
  expect(outline.querySelectorAll("button")).toHaveLength(0);
  expect(outline.querySelectorAll(".canvas-timeline-hover-handle")).toHaveLength(4);
  act(() => transport.seek({ value: 1, rate: 2 }));
  expect(outline.style.transform).toContain(",50,");
  act(() => {
    view = { ...view, zoom: 2 };
    listeners.forEach((listener) => listener());
  });
  expect(outline.style.borderWidth).toBe("0.5px");
  act(() => transport.play());
  expect(outline.style.opacity).toBe("0.2");
  act(() => transport.pause());
  expect(outline.style.opacity).toBe("1");
  expect(d.engine.getSnapshot()).toBe(before);
  expect(renders).toBe(1);
  clear();
  expect(outline.style.display).toBe("none");
  mount.unmount();
  expect(listeners.size).toBe(0);
});

test("temporally absent hover targets disappear and unmount/page changes cannot leave stale decoration", () => {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const page = d.engine.getSnapshot().project.pages[0]!;
  const track = page.motion!.tracks.find((item) => item.layerId === d.rectangle.id)!;
  d.engine.execute({
    type: "setMotionTrackRange",
    trackId: track.id,
    start: { value: 0, rate: 1 },
    end: { value: 1, rate: 2 },
  });
  const controller = new SceneController(d.engine, EMPTY_PREVIEW_SOURCE),
    hover = createTimelineHoverSource(d.engine),
    transport = createMotionTransport(d.engine);
  const mount = d.mount(
    <CanvasSelection
      engine={d.engine}
      controller={controller}
      viewSource={{ read: () => ({ x: 0, y: 0, zoom: 1 }), subscribe: () => () => {} }}
      viewport={{ current: null }}
      showHandles
      onHandle={vi.fn()}
    />,
  );
  const clear = hover.show(page.id, d.rectangle.id);
  const outline = document.querySelector<HTMLElement>(".canvas-timeline-hover")!;
  expect(outline.style.display).toBe("");
  act(() => transport.seek({ value: 3, rate: 4 }));
  expect(outline.style.display).toBe("none");
  act(() => transport.seek({ value: 1, rate: 4 }));
  expect(outline.style.display).toBe("");
  mount.unmount();
  clear();
  expect(hover.read()).toBeNull();
});

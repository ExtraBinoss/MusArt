import { act, fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { CanvasSelection } from "../../../src/canvas/selection/CanvasSelection";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { EMPTY_PREVIEW_SOURCE } from "../../../src/state/session/preview-source";
import { setup } from "../../support/ui";

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

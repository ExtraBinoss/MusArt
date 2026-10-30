import { expect, test, vi } from "vitest";
import { installTouchNavigation } from "../../../src/canvas/viewport/touch-navigation";
import type { View } from "../../../src/canvas/viewport/view";

function pointer(
  element: HTMLElement,
  type: string,
  id: number,
  x = 0,
  y = 0,
  pointerType = "touch",
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: id, pointerType, clientX: x, clientY: y });
  element.dispatchEvent(event);
  return event;
}
test("two fingers cancel a document gesture, zoom around their midpoint and pan without settling", () => {
  const canvas = document.createElement("div");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 400,
    height: 400,
  } as DOMRect);
  let view: View = { x: 0, y: 0, zoom: 1 };
  const jump = vi.fn((next: View) => {
      view = next;
    }),
    stop = vi.fn(),
    cancel = vi.fn();
  const dispose = installTouchNavigation(canvas, { read: () => view, jump, stop }, cancel);
  expect(pointer(canvas, "pointerdown", 1, 100, 200).defaultPrevented).toBe(false);
  expect(pointer(canvas, "pointerdown", 2, 300, 200).defaultPrevented).toBe(true);
  expect(cancel).toHaveBeenCalledOnce();
  pointer(canvas, "pointermove", 1, 0, 200);
  pointer(canvas, "pointermove", 2, 400, 200);
  expect(jump).toHaveBeenLastCalledWith({ x: 0, y: 0, zoom: 2 }, false);
  pointer(canvas, "pointermove", 1, 50, 250);
  pointer(canvas, "pointermove", 2, 450, 250);
  expect(jump).toHaveBeenLastCalledWith({ x: 50, y: 50, zoom: 2 }, false);
  pointer(canvas, "pointerup", 2);
  expect(pointer(canvas, "pointermove", 1, 50, 280).defaultPrevented).toBe(true);
  pointer(canvas, "pointerup", 1);
  expect(stop).toHaveBeenCalledTimes(2);
  dispose();
  pointer(canvas, "pointerdown", 3);
  pointer(canvas, "pointerdown", 4);
  expect(cancel).toHaveBeenCalledOnce();
});
test("mouse and canvas controls keep their interactions, and interrupted navigation releases its state", () => {
  const canvas = document.createElement("div"),
    button = document.createElement("button");
  button.dataset.canvasControl = "";
  canvas.append(button);
  const stop = vi.fn(),
    cancel = vi.fn();
  const dispose = installTouchNavigation(
    canvas,
    { read: () => ({ x: 0, y: 0, zoom: 1 }), jump: vi.fn(), stop },
    cancel,
  );
  pointer(button, "pointerdown", 1);
  pointer(canvas, "pointerdown", 2, 0, 0, "mouse");
  pointer(canvas, "pointerdown", 3);
  expect(cancel).not.toHaveBeenCalled();
  pointer(canvas, "pointerdown", 4);
  expect(cancel).toHaveBeenCalledOnce();
  dispose();
  expect(stop).toHaveBeenCalledTimes(2);
});

import { fireEvent } from "@testing-library/react";

/** Page-local coordinates in the canvas fixture's centered 200×160 artboard. */
export function canvasPoint(x: number, y: number) {
  return { clientX: 400 + x, clientY: 320 + y, pointerId: 1, button: 0 };
}
export function pointerDrag(
  element: HTMLElement,
  from: ReturnType<typeof canvasPoint>,
  to: ReturnType<typeof canvasPoint>,
  extra = {},
) {
  fireEvent.pointerDown(element, { ...from, ...extra });
  fireEvent.pointerMove(element, { ...to, ...extra });
  fireEvent.pointerUp(element, { ...to, ...extra });
}

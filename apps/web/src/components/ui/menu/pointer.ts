import type { PointerEventHandler } from "react";

/** Radix's drag-release click must only activate items for the primary button. */
export function menuPointerUpCapture<Element extends HTMLElement>(
  onPointerUpCapture?: PointerEventHandler<Element>,
): PointerEventHandler<Element> {
  return (event) => {
    onPointerUpCapture?.(event);
    if (event.button === 0) return;
    event.preventDefault();
    event.stopPropagation();
  };
}

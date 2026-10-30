/** Stable pointer data permits a delayed axis decision without retaining a React event. */
export interface TimelinePointerMove {
  pointerId: number;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
}

export interface TimelinePointerInput extends TimelinePointerMove {
  node: HTMLElement;
  button: number;
  originalLayers?: readonly string[];
}

export function toTimelinePointerInput(
  event: TimelinePointerMove & { currentTarget: HTMLElement; button: number },
): TimelinePointerInput {
  return {
    node: event.currentTarget,
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    button: event.button,
    shiftKey: event.shiftKey,
  };
}

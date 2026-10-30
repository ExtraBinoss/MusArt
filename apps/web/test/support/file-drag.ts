/** JSDOM has no DragEvent/DataTransfer; retain native Files types and real File objects. */
export function fileDragEvent(
  type: string,
  options: {
    files?: File[];
    relatedTarget?: EventTarget;
    clientX?: number;
    clientY?: number;
  } = {},
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: { types: ["Files"], files: options.files ?? [] } },
    relatedTarget: { value: options.relatedTarget ?? null },
    clientX: { value: options.clientX ?? 0 },
    clientY: { value: options.clientY ?? 0 },
  });
  return event;
}

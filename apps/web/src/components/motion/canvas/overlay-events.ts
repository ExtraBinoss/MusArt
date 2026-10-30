import type { DragEvent as ReactDragEvent } from "react";
import type { TimelineCanvasHit } from "./model";

/** Trim/body share one semantic target; changing the pointed edge never remounts its menu. */
export function timelineHitIdentity(hit: TimelineCanvasHit | null): string {
  if (!hit) return "";
  if (hit.kind === "gap") return `${hit.rowKey}:gap`;
  if (hit.kind === "key")
    return `${hit.rowKey}:key:${hit.keyId}:${hit.firstKeyIndex}:${hit.afterKeyIndex}`;
  if (hit.kind === "easing") return `${hit.rowKey}:easing:${hit.keyId}`;
  return `${hit.rowKey}:${hit.kind.startsWith("audio") ? "audio" : "clip"}:${hit.trackId}`;
}

/** The shared layer controller reads the real native event through the pointed HTML row. */
export function timelineLayerDragEvent(
  event: globalThis.DragEvent,
  row: HTMLElement,
): ReactDragEvent<HTMLElement> {
  return new Proxy(event, {
    get(target, key) {
      if (key === "currentTarget") return row;
      if (key === "nativeEvent") return target;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as unknown as ReactDragEvent<HTMLElement>;
}

/** A touch/fast click can precede hover. Promote that one native input to its new semantic target. */
export function promoteTimelinePointer(event: PointerEvent, target: HTMLElement) {
  target.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      button: event.button,
      buttons: event.buttons,
      clientX: event.clientX,
      clientY: event.clientY,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    }),
  );
}

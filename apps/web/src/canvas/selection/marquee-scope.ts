import type { EnginePort } from "@musart/core";
import { captureGestureOrigin, type GestureOrigin } from "../interaction/gesture-origin";
import type { Point } from "../viewport/view";

export interface MarqueeScope {
  origin: GestureOrigin;
  from: Point;
  client: Point;
  boxSelection?: {
    initial: readonly string[];
    additive: boolean;
    intersect: boolean;
    pageId?: string;
  };
}

/** A secondary click keeps its page; only a real drag activates an inactive artboard. */
export function prepareMarqueePage<T extends MarqueeScope>(
  engine: EnginePort,
  gesture: { current: T | null },
  event: { clientX: number; clientY: number },
  pagePoint: (event: { clientX: number; clientY: number }) => Point,
) {
  const active = gesture.current,
    box = active?.boxSelection;
  if (
    !active ||
    !box?.pageId ||
    Math.hypot(event.clientX - active.client.x, event.clientY - active.client.y) <= 3
  )
    return;
  // Authoritative page subscriptions must not mistake this intentional activation for a stale draft.
  gesture.current = null;
  engine.setPage(box.pageId);
  active.origin = captureGestureOrigin(engine);
  active.from = pagePoint({ clientX: active.client.x, clientY: active.client.y });
  box.initial = engine.getSnapshot().selection;
  delete box.pageId;
  gesture.current = active;
}

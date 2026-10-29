import type { EnginePort } from "@musart/core";
import {
  captureGestureOrigin,
  isGestureOriginCurrent,
  type GestureOrigin,
} from "../interaction/gesture-origin";
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

export function intersectingMarquee(
  engine: EnginePort,
  additive: boolean,
  pageId?: string,
): NonNullable<MarqueeScope["boxSelection"]> {
  const snapshot = engine.getSnapshot();
  return {
    initial: snapshot.selection,
    additive,
    intersect: true,
    ...(pageId && pageId !== snapshot.pageId ? { pageId } : {}),
  };
}

/** A secondary click keeps its page; only a real drag activates an inactive artboard. */
export function prepareMarqueePage<T extends MarqueeScope>(
  engine: EnginePort,
  gesture: { current: T | null },
  event: { clientX: number; clientY: number },
  pagePoint: (event: { clientX: number; clientY: number }) => Point,
): boolean {
  const active = gesture.current,
    box = active?.boxSelection;
  if (!active) return false;
  if (!isGestureOriginCurrent(engine, active.origin)) {
    gesture.current = null;
    return false;
  }
  if (
    !box?.pageId ||
    Math.hypot(event.clientX - active.client.x, event.clientY - active.client.y) <= 3
  )
    return true;
  const origin = active.origin,
    targetId = box.pageId;
  if (!origin.project.pages.some((page) => page.id === targetId)) {
    gesture.current = null;
    return false;
  }
  // Authoritative page subscriptions must not mistake this intentional activation for a stale draft.
  gesture.current = null;
  engine.setPage(targetId);
  const snapshot = engine.getSnapshot();
  // setPage may synchronously notify a loader/editor. Never adopt that replacement as our origin.
  if (
    snapshot.project !== origin.project ||
    snapshot.revision !== origin.revision ||
    snapshot.pageId !== targetId ||
    snapshot.selection.length !== 0 ||
    gesture.current !== null
  )
    return false;
  const nextOrigin = captureGestureOrigin(engine),
    from = pagePoint({ clientX: active.client.x, clientY: active.client.y });
  if (!isGestureOriginCurrent(engine, nextOrigin) || gesture.current !== null) return false;
  active.origin = nextOrigin;
  active.from = from;
  box.initial = snapshot.selection;
  delete box.pageId;
  gesture.current = active;
  return true;
}

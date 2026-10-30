import { zoomAt, type Point, type View } from "./view";
import type { ViewMotion } from "./motion";

/** Two fingers temporarily own navigation; a cancelled document drag never commits. */
export function installTouchNavigation(
  element: HTMLElement,
  motion: Pick<ViewMotion, "read" | "jump" | "stop">,
  cancelGesture: () => void,
) {
  const touches = new Map<number, Point>();
  let origin: { center: Point; distance: number; view: View } | null = null;
  let navigating = false;
  const pose = () => {
    const [a, b] = [...touches.values()];
    if (!a || !b) return null;
    return {
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
    };
  };
  const block = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  function down(event: PointerEvent) {
    if (event.pointerType !== "touch" || (event.target as Element).closest("[data-canvas-control]"))
      return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size < 2 && !navigating) return;
    if (!navigating) {
      cancelGesture();
      motion.stop();
      navigating = true;
    }
    const next = pose();
    if (next && !origin) origin = { ...next, view: motion.read() };
    block(event);
  }
  function move(event: PointerEvent) {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!navigating) return;
    block(event);
    const next = pose();
    if (!next || !origin) return;
    const rect = element.getBoundingClientRect();
    const view = zoomAt(origin.view, next.distance / origin.distance, {
      x: origin.center.x - rect.left - rect.width / 2,
      y: origin.center.y - rect.top - rect.height / 2,
    });
    motion.jump(
      {
        ...view,
        x: view.x + next.center.x - origin.center.x,
        y: view.y + next.center.y - origin.center.y,
      },
      false,
    );
  }
  function end(event: PointerEvent) {
    if (!touches.delete(event.pointerId)) return;
    if (navigating) block(event);
    if (touches.size < 2) origin = null;
    if (!touches.size && navigating) {
      navigating = false;
      motion.stop();
    }
  }
  element.addEventListener("pointerdown", down, true);
  element.addEventListener("pointermove", move, true);
  element.addEventListener("pointerup", end, true);
  element.addEventListener("pointercancel", end, true);
  return () => {
    element.removeEventListener("pointerdown", down, true);
    element.removeEventListener("pointermove", move, true);
    element.removeEventListener("pointerup", end, true);
    element.removeEventListener("pointercancel", end, true);
    touches.clear();
    if (navigating) motion.stop();
  };
}

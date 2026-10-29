import type { Point } from "../viewport/view";

interface ReleaseGesture {
  client: Point;
  from: Point;
  current: Point;
  modifiers?: { alt: boolean; shift: boolean };
}
interface ReleasePointer {
  clientX: number;
  clientY: number;
  altKey: boolean;
  shiftKey: boolean;
}

/** A stationary selection click must not force layout after its selection updates. */
export function readReleasePoint(
  gesture: ReleaseGesture,
  pointer: ReleasePointer,
  readPoint: () => Point,
): Point | null {
  const stationary =
    pointer.clientX === gesture.client.x &&
    pointer.clientY === gesture.client.y &&
    gesture.current.x === gesture.from.x &&
    gesture.current.y === gesture.from.y;
  const modifiers = gesture.modifiers;
  const unchangedModifiers =
    !modifiers || (modifiers.alt === pointer.altKey && modifiers.shift === pointer.shiftKey);
  return stationary && unchangedModifiers ? null : readPoint();
}

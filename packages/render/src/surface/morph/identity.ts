import type { ShapeMorph } from "@musart/core";
const identities = new WeakMap<ShapeMorph, number>();
let next = 0;
/** Session-local resource identity only; portable geometry keeps its authored data. */
export function morphIdentity(shape: ShapeMorph): number {
  let id = identities.get(shape);
  if (id === undefined) {
    id = ++next;
    identities.set(shape, id);
  }
  return id;
}

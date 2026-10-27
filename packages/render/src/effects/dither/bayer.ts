import type { Node } from "three/webgpu";
import { floor, mod } from "three/tsl";

/** Plinka Bayer threshold, expressed entirely as a portable TSL graph. */
export function bayer2(point: Node<"vec2">) {
  const p = mod(floor(point), 2);
  return p.x.mul(2).add(p.y.mul(3)).sub(p.x.mul(p.y).mul(4));
}
export function bayer4(point: Node<"vec2">) {
  return bayer2(point)
    .mul(4)
    .add(bayer2(floor(point.div(2))))
    .add(0.5)
    .div(16);
}

import type { Node } from "three/webgpu";
import { floor } from "three/tsl";
import { bayer2 } from "../dither/bayer";

/** Standard recursive Bayer ranks, centered inside each of N² threshold bins. */
export function bayerThreshold(point: Node<"vec2">, order: 2 | 4 | 8) {
  let rank = bayer2(point).mul(order === 8 ? 16 : order === 4 ? 4 : 1);
  if (order >= 4) rank = rank.add(bayer2(floor(point.div(2))).mul(order === 8 ? 4 : 1));
  if (order === 8) rank = rank.add(bayer2(floor(point.div(4))));
  return rank.add(0.5).div(order * order);
}

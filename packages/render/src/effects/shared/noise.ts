import type { Node } from "three/webgpu";
import { float, uint, uvec2 } from "three/tsl";
export type NoiseSeed = Node<"float"> | Node<"uint">;
/** Integer hash is deterministic across TSL WGSL/GLSL backends and document reloads. */
export function noise2d(position: Node<"vec2">, seed: NoiseSeed) {
  const p = uvec2(position);
  let n = p.x
    .mul(uint(374761393))
    .add(p.y.mul(uint(668265263)))
    .add(uint(seed));
  n = n.bitXor(n.shiftRight(uint(13))).mul(uint(1274126177));
  n = n.bitXor(n.shiftRight(uint(16)));
  return float(n.bitAnd(uint(16777215))).div(16777215);
}

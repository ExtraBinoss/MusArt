// MIT field port: ExtraBinoss / Plinka (2026). Integer hashes replace floating hashes
// so fixed-time renders agree between Three's WGSL and GLSL backends.
import type { Node } from "three/webgpu";
import { float, floor, fract, mix, vec2 } from "three/tsl";
import { noise2d } from "../../shared/noise";
export function gradientHash(p: Node<"vec2">) {
  return noise2d(floor(p).add(1048576), float(97));
}
export function stripesHash(p: Node<"vec2">) {
  return noise2d(floor(p).add(1048576), float(341));
}
export function stripesNoise(p: Node<"vec2">) {
  const i = floor(p),
    f = fract(p),
    eased = f.mul(f).mul(f.mul(-2).add(3));
  return mix(
    mix(stripesHash(i), stripesHash(i.add(vec2(1, 0))), eased.x),
    mix(stripesHash(i.add(vec2(0, 1))), stripesHash(i.add(1)), eased.x),
    eased.y,
  );
}

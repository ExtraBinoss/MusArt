import { clamp, max, min, vec3 } from "three/tsl";
import type { RGB } from "./types";
export const darken = (b: RGB, s: RGB) => min(b, s);
export const multiply = (b: RGB, s: RGB) => b.mul(s);
export const linearBurn = (b: RGB, s: RGB) => max(b.add(s).sub(1), 0);
export function colorBurn(b: RGB, s: RGB) {
  return b
    .greaterThanEqual(vec3(1))
    .select(
      vec3(1),
      s
        .lessThanEqual(vec3(0))
        .select(vec3(0), clamp(b.oneMinus().div(max(s, 0.000001)).oneMinus(), 0, 1)),
    );
}

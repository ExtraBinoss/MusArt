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

/** Photoshop whole-color comparison uses the sum of channels; ties keep the backdrop. */
export const darkerColor = (b: RGB, s: RGB) =>
  s.r.add(s.g).add(s.b).lessThan(b.r.add(b.g).add(b.b)).select(s, b);

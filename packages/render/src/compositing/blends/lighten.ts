import { max, min, vec3 } from "three/tsl";
import type { RGB } from "./types";
export const lighten = (b: RGB, s: RGB) => max(b, s);
export const screen = (b: RGB, s: RGB) => b.add(s).sub(b.mul(s));
export const add = (b: RGB, s: RGB) => min(b.add(s), 1);
export function colorDodge(b: RGB, s: RGB) {
  return b
    .lessThanEqual(vec3(0))
    .select(
      vec3(0),
      s.greaterThanEqual(vec3(1)).select(vec3(1), min(b.div(max(s.oneMinus(), 0.000001)), 1)),
    );
}

/** Whole-color selection preserves one complete RGB triplet. */
export const lighterColor = (b: RGB, s: RGB) =>
  s.r.add(s.g).add(s.b).greaterThan(b.r.add(b.g).add(b.b)).select(s, b);

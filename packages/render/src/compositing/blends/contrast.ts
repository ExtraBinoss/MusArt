import { clamp, min, max, mix, sqrt, step } from "three/tsl";
import { colorBurn } from "./darken";
import { colorDodge } from "./lighten";
import type { RGB } from "./types";
export const overlay = (b: RGB, s: RGB) =>
  mix(b.mul(s).mul(2), b.oneMinus().mul(s.oneMinus()).mul(2).oneMinus(), step(0.5, b));
export const hardLight = (b: RGB, s: RGB) => overlay(s, b);
export function softLight(b: RGB, s: RGB) {
  const d = mix(b.mul(16).sub(12).mul(b).add(4).mul(b), sqrt(b), step(0.25, b));
  return mix(
    b.sub(s.mul(2).oneMinus().mul(b).mul(b.oneMinus())),
    b.add(s.mul(2).sub(1).mul(d.sub(b))),
    step(0.5, s),
  );
}
export const vividLight = (b: RGB, s: RGB) =>
  mix(colorBurn(b, s.mul(2)), colorDodge(b, s.mul(2).sub(1)), step(0.5, s));
export const linearLight = (b: RGB, s: RGB) => clamp(b.add(s.mul(2)).sub(1), 0, 1);
export const pinLight = (b: RGB, s: RGB) =>
  mix(min(b, s.mul(2)), max(b, s.mul(2).sub(1)), step(0.5, s));
export const hardMix = (b: RGB, s: RGB) => step(0.5, vividLight(b, s));

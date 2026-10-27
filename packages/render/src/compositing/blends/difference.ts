import { abs, max, min } from "three/tsl";
import type { RGB } from "./types";
export const difference = (b: RGB, s: RGB) => abs(b.sub(s));
export const exclusion = (b: RGB, s: RGB) => b.add(s).sub(b.mul(s).mul(2));
export const subtract = (b: RGB, s: RGB) => max(b.sub(s), 0);
export const divide = (b: RGB, s: RGB) => min(b.div(max(s, 0.000001)), 1);

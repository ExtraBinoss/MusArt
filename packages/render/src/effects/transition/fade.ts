import { max, mix, pow, vec3, vec4 } from "three/tsl";
import { withCoverage, type TransitionOperator } from "./shared";

export const fade: TransitionOperator = (f) => withCoverage(f.original, f.progress);
export const fadeBlack: TransitionOperator = (f) =>
  vec4(f.original.rgb.mul(pow(f.progress, max(0.25, f.strength))), f.original.a.mul(f.progress));
export const fadeWhite: TransitionOperator = (f) =>
  vec4(
    mix(vec3(1), f.original.rgb, pow(f.progress, max(0.25, f.strength))),
    f.original.a.mul(f.progress),
  );

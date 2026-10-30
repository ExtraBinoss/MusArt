import { dot, floor, fract, mod, vec3 } from "three/tsl";
import { noise2d } from "../shared/noise";
import { reveal, type TransitionOperator } from "./shared";

export const blinds: TransitionOperator = (f) => reveal(f, fract(f.rank().mul(f.detail)));
export const checkerboard: TransitionOperator = (f) => {
  const grid = f.position.mul(f.detail),
    cell = floor(grid);
  const parity = mod(cell.x.add(cell.y), 2);
  return reveal(f, parity.mul(0.5).add(f.rank(fract(grid)).mul(0.5)));
};
export const gridReveal: TransitionOperator = (f) => {
  const cell = fract(f.position.mul(f.detail)).sub(0.5).abs().mul(2);
  return reveal(f, cell.x.max(cell.y));
};
export const luma: TransitionOperator = (f) =>
  reveal(f, dot(f.original.rgb, vec3(0.2126, 0.7152, 0.0722)).oneMinus());
export const dissolve: TransitionOperator = (f) => {
  const grid = f.position.mul(f.context.controls.logicalResolution).div(f.detail.mul(2));
  return reveal(f, noise2d(floor(grid).add(1048576), f.context.controls.randomSeedUint));
};

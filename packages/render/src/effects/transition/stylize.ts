import type { Node } from "three/webgpu";
import { clamp, floor, fract, length, max, mix, vec2, vec3, vec4 } from "three/tsl";
import { noise2d } from "../shared/noise";
import { reveal, revealCoverage, withCoverage, type TransitionOperator } from "./shared";

export const pixelate: TransitionOperator = (f) => {
  const block = max(1, f.remaining.mul(f.detail).mul(f.strength).mul(12));
  const cells = max(vec2(1), f.context.controls.logicalResolution.div(block));
  const center = floor(f.position.mul(cells)).add(0.5).div(cells);
  return withCoverage(f.read(mix(center, f.position, f.progress)), f.progress);
};
/** Nine taps total including the shared exact center, mixed in premultiplied space. */
export const defocus: TransitionOperator = (f) => {
  const radius = f.remaining.mul(f.remaining).mul(f.strength).mul(f.detail).mul(1.5);
  const step = radius.div(f.context.controls.logicalResolution);
  let rgb: Node<"vec3"> = f.original.rgb.mul(f.original.a).mul(4);
  let alpha: Node<"float"> = f.original.a.mul(4);
  const taps = [
    [-1, 0, 2],
    [1, 0, 2],
    [0, -1, 2],
    [0, 1, 2],
    [-1, -1, 1],
    [1, -1, 1],
    [-1, 1, 1],
    [1, 1, 1],
  ] as const;
  for (const [x, y, weight] of taps) {
    const sample = f.read(f.position.add(vec2(x, y).mul(step)));
    rgb = rgb.add(sample.rgb.mul(sample.a).mul(weight));
    alpha = alpha.add(sample.a.mul(weight));
  }
  return vec4(rgb.div(max(alpha, 0.000001)), alpha.div(16).mul(f.progress));
};
export const rgbSplit: TransitionOperator = (f) => {
  const offset = f.axis.mul(f.remaining).mul(f.strength).mul(0.08);
  const red = f.read(f.position.add(offset)),
    blue = f.read(f.position.sub(offset));
  return vec4(vec3(red.r, f.original.g, blue.b), f.original.a.mul(f.progress));
};
export const glitch: TransitionOperator = (f) => {
  const band = floor(f.position.y.mul(f.detail).mul(2));
  const epoch = floor(f.progress.mul(f.detail).mul(3));
  const seed = f.context.controls.randomSeedUint;
  const hash = noise2d(vec2(band, epoch).add(1048576), seed);
  const shift = hash.sub(0.5).mul(f.remaining).mul(f.strength).mul(0.35);
  const coord = f.position.add(vec2(shift, 0));
  const split = f.remaining.mul(f.strength).mul(0.025);
  const green = f.read(coord),
    red = f.read(coord.add(vec2(split, 0))),
    blue = f.read(coord.sub(vec2(split, 0)));
  return vec4(vec3(red.r, green.g, blue.b), green.a.mul(f.progress));
};
function organicNoise(position: Node<"vec2">, seed: Node<"uint">) {
  const cell = floor(position),
    local = fract(position);
  const eased = local.mul(local).mul(local.mul(-2).add(3));
  return mix(
    mix(noise2d(cell.add(1048576), seed), noise2d(cell.add(vec2(1048577, 1048576)), seed), eased.x),
    mix(noise2d(cell.add(vec2(1048576, 1048577)), seed), noise2d(cell.add(1048577), seed), eased.x),
    eased.y,
  );
}
export const ink: TransitionOperator = (f) => {
  const point = f.position.mul(vec2(f.aspect, 1)).mul(f.detail);
  const seed = f.context.controls.randomSeedUint;
  const field = organicNoise(point.mul(0.7), seed)
    .mul(0.65)
    .add(organicNoise(point.mul(2).add(37), seed).mul(0.35));
  return reveal(f, field.mul(0.8).add(f.rank().mul(0.2)));
};
export const halftone: TransitionOperator = (f) => {
  const cells = max(vec2(2), vec2(f.aspect, 1).mul(f.detail));
  const dot = length(fract(f.position.mul(cells)).sub(0.5)).mul(Math.SQRT2);
  return reveal(f, dot);
};
export const mosaic: TransitionOperator = (f) => {
  const cells = max(vec2(2), vec2(f.aspect, 1).mul(f.detail));
  const cell = floor(f.position.mul(cells)),
    seed = f.context.controls.randomSeedUint;
  const id = cell.add(1048576),
    random = vec2(noise2d(id, seed), noise2d(id.add(61), seed));
  const center = cell.add(0.5).div(cells);
  const displacement = random.sub(0.5).mul(f.remaining).mul(f.strength).div(cells);
  const coord = mix(center, f.position, f.progress).add(displacement);
  const order = random.x.mul(0.7).add(f.rank().mul(0.3));
  return withCoverage(f.read(coord), revealCoverage(f, clamp(order, 0, 1)));
};

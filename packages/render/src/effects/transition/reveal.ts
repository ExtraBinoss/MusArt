import { abs, atan, float, fract, length, vec2 } from "three/tsl";
import { reveal, type TransitionOperator } from "./shared";

export const wipe: TransitionOperator = (f) => reveal(f, f.rank());
export const diagonalWipe: TransitionOperator = (f) => {
  const cross = f.horizontal.select(f.position.y, f.position.x);
  const perpendicular = f.positive.select(cross, cross.oneMinus());
  return reveal(f, f.rank().add(perpendicular).mul(0.5));
};
export const radialWipe: TransitionOperator = (f) => {
  const turn = atan(f.physical.y, f.physical.x.add(0.000001)).div(Math.PI * 2);
  const direction = f.context.controls.parameters.direction!;
  const origin = direction
    .equal(0)
    .select(0.5, direction.equal(1).select(0, direction.equal(2).select(0.25, 0.75)));
  return reveal(f, fract(turn.sub(origin).add(1)));
};
export const iris: TransitionOperator = (f) => {
  const corner = length(vec2(f.aspect, 1)).mul(0.5);
  return reveal(f, length(f.physical).div(corner));
};
export const diamond: TransitionOperator = (f) =>
  reveal(
    f,
    abs(f.physical.x)
      .add(abs(f.physical.y))
      .div(f.aspect.add(float(1)).mul(0.5)),
  );

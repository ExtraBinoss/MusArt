import {
  abs,
  atan,
  clamp,
  cos,
  float,
  length,
  max,
  mix,
  mod,
  pow,
  rotate,
  sin,
  vec2,
} from "three/tsl";
import { withCoverage, type TransitionOperator } from "./shared";

export const swirl: TransitionOperator = (f) => {
  const radius = length(f.physical),
    envelope = pow(clamp(float(1).sub(radius.mul(1.4)), 0, 1), 2);
  const angle = f.remaining
    .mul(f.strength)
    .mul(Math.PI * 2)
    .mul(envelope)
    .mul(f.sign);
  return withCoverage(f.read(f.fromPhysical(rotate(f.physical, angle))), f.progress);
};
export const ripple: TransitionOperator = (f) => {
  const radius = length(f.physical),
    direction = f.physical.div(max(0.0001, radius));
  const phase = radius
    .mul(f.detail)
    .sub(f.progress)
    .mul(Math.PI * 2);
  const displacement = sin(phase)
    .mul(f.remaining)
    .mul(f.strength)
    .mul(0.08)
    .mul(clamp(float(1).sub(radius), 0, 1));
  return withCoverage(
    f.read(f.fromPhysical(f.physical.add(direction.mul(displacement)))),
    f.progress,
  );
};
export const wave: TransitionOperator = (f) => {
  const phase = f.perpendicular
    .mul(f.detail)
    .add(f.progress)
    .mul(Math.PI * 2);
  const shift = sin(phase).mul(f.remaining).mul(f.strength).mul(0.1);
  return withCoverage(f.read(f.position.add(f.axis.mul(shift))), f.progress);
};
export const kaleidoscope: TransitionOperator = (f) => {
  const radius = length(f.physical),
    angle = atan(f.physical.y, f.physical.x.add(0.000001));
  const sector = float(Math.PI * 2).div(f.detail);
  const folded = abs(mod(angle.add(sector.mul(0.5)), sector).sub(sector.mul(0.5)));
  const reflected = f.fromPhysical(vec2(cos(folded), sin(folded)).mul(radius));
  const amount = f.remaining.mul(clamp(f.strength, 0, 1));
  return withCoverage(f.read(mix(f.position, reflected, amount)), f.progress);
};

import { abs, clamp, cos, max, mix, pow, rotate, sin } from "three/tsl";
import { travelCoverage, withCoverage, type TransitionOperator } from "./shared";

export const slide: TransitionOperator = (f) =>
  withCoverage(f.read(f.position.sub(f.axis.mul(f.remaining).mul(f.strength))), travelCoverage(f));
export const zoom: TransitionOperator = (f) => {
  const scale = mix(1, max(0.001, pow(f.progress, max(1, f.strength))), clamp(f.strength, 0, 1));
  return withCoverage(f.read(f.centered.div(scale).add(0.5)), f.progress);
};
export const spin: TransitionOperator = (f) => {
  const angle = f.remaining
    .mul(f.strength)
    .mul(Math.PI * 2)
    .mul(f.sign);
  const rotated = rotate(f.physical, angle);
  return withCoverage(f.read(f.fromPhysical(rotated)), f.progress);
};
export const flip: TransitionOperator = (f) => {
  const angle = f.remaining.mul(Math.PI * 0.5).mul(clamp(f.strength, 0, 1));
  const perspective = max(0.001, cos(angle).sub(f.along.mul(sin(angle)).mul(f.sign).mul(0.8)));
  const local = f.along.div(perspective);
  const cross = f.perpendicular.mul(local.mul(sin(angle)).mul(f.sign).mul(0.8).add(1));
  return withCoverage(f.read(f.fromAxes(local, cross)), f.progress);
};
export const doorway: TransitionOperator = (f) => {
  const scale = max(0.001, f.progress);
  const axis = f.along.add(0.5);
  const local = axis.lessThan(0.5).select(axis.div(scale), axis.oneMinus().div(scale).oneMinus());
  const cross = f.perpendicular.mul(abs(local.sub(0.5)).mul(f.remaining).mul(f.strength).add(1));
  return withCoverage(f.read(f.fromAxes(local.sub(0.5), cross)), f.progress);
};
export const squeeze: TransitionOperator = (f) => {
  const scale = max(0.001, pow(f.progress, max(0.25, f.strength)));
  const bulge = sin(f.progress.mul(Math.PI)).mul(f.strength).mul(0.3).add(1);
  return withCoverage(
    f.read(f.fromAxes(f.along.div(scale), f.perpendicular.div(bulge))),
    f.progress,
  );
};

import type { Node } from "three/webgpu";
import { clamp, max, mix, pow, smoothstep, vec2, vec4, uv } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";

/** Controls and coordinates are authored values; no wall clock or raster-density state. */
export function transitionField(context: EffectNodeContext) {
  const controls = context.controls,
    u = controls.parameters,
    position = uv();
  const progress = clamp(u.progress!, 0, 1);
  const remaining = progress.oneMinus();
  const strength = clamp(u.strength!, 0, 2);
  const softness = clamp(u.softness!, 0.001, 0.25);
  const detail = clamp(u.detail!, 2, 32);
  const horizontal = u.direction!.lessThan(2);
  const positive = u.direction!.equal(1).or(u.direction!.equal(2));
  const sign = positive.select(1, -1);
  const axis = horizontal.select(vec2(sign, 0), vec2(0, sign));
  const aspect = controls.logicalResolution.x.div(max(0.0001, controls.logicalResolution.y));
  const centered = position.sub(0.5),
    physical = centered.mul(vec2(aspect, 1));
  const original: Node<"vec4"> = sampleEffect(context.source, controls, position);
  function rank(coord: Node<"vec2"> = position) {
    const along = horizontal.select(coord.x, coord.y);
    return positive.select(along.oneMinus(), along);
  }
  function read(coord: Node<"vec2">): Node<"vec4"> {
    const inside = coord.x
      .greaterThanEqual(0)
      .and(coord.x.lessThanEqual(1))
      .and(coord.y.greaterThanEqual(0))
      .and(coord.y.lessThanEqual(1));
    return sampleEffect(context.source, controls, clamp(coord, 0, 1)).mul(inside.select(1, 0));
  }
  function fromAxes(along: Node<"float">, perpendicular: Node<"float">) {
    return horizontal.select(vec2(along, perpendicular), vec2(perpendicular, along)).add(0.5);
  }
  function fromPhysical(coord: Node<"vec2">) {
    return coord.div(vec2(aspect, 1)).add(0.5);
  }
  const along = horizontal.select(centered.x, centered.y);
  const perpendicular = horizontal.select(centered.y, centered.x);
  return {
    context,
    position,
    progress,
    remaining,
    strength,
    softness,
    detail,
    horizontal,
    positive,
    sign,
    axis,
    aspect,
    centered,
    physical,
    original,
    rank,
    read,
    fromAxes,
    fromPhysical,
    along,
    perpendicular,
  };
}
export type TransitionField = ReturnType<typeof transitionField>;
export type TransitionOperator = (field: TransitionField) => Node<"vec4">;

/** The overscan makes a soft reveal reach zero/one continuously at the exact endpoints. */
export function revealCoverage(field: TransitionField, order: Node<"float">) {
  const rank = pow(clamp(order, 0, 1), max(0.25, field.strength));
  const front = field.progress.mul(field.softness.mul(2).add(1)).sub(field.softness);
  return smoothstep(rank.sub(field.softness), rank.add(field.softness), front);
}
export function withCoverage(sample: Node<"vec4">, coverage: Node<"float">) {
  return vec4(sample.rgb, sample.a.mul(clamp(coverage, 0, 1)));
}
export function reveal(field: TransitionField, order: Node<"float">) {
  return withCoverage(field.original, revealCoverage(field, order));
}
export function travelCoverage(field: TransitionField) {
  return mix(field.progress, 1, clamp(field.strength, 0, 1));
}

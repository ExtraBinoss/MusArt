import type { Node } from "three/webgpu";
import {
  clamp,
  cos,
  dot,
  floor,
  length,
  max,
  mix,
  pow,
  sin,
  smoothstep,
  sqrt,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";

function rotate(p: Node<"vec2">, angle: Node<"float">) {
  const c = cos(angle),
    s = sin(angle);
  return vec2(p.x.mul(c).sub(p.y.mul(s)), p.x.mul(s).add(p.y.mul(c)));
}

/** A static, registered circular screen in authored document pixels. */
export function circleNode({ source, controls }: EffectNodeContext) {
  const u = controls.parameters,
    colors = controls.colors;
  const position = uv(),
    original = sampleEffect(source, controls, position);
  const size = controls.logicalResolution,
    spacing = max(2, u.spacing!);
  const angle = u.rotation!.mul(Math.PI / 180);
  const documentPosition = vec2(position.x, position.y.oneMinus()).mul(size);
  const grid = rotate(documentPosition.sub(size.mul(0.5)), angle.negate());
  const cellCenter = floor(grid.div(spacing)).add(0.5).mul(spacing);
  const center = rotate(cellCenter, angle).add(size.mul(0.5)).div(size);
  const sample = sampleEffect(source, controls, vec2(center.x, center.y.oneMinus()));
  const luma = clamp(dot(sample.rgb, vec3(0.2126, 0.7152, 0.0722)), 0, 1);
  const tone = pow(mix(luma.oneMinus(), luma, u.polarity!), u.gamma!);
  const radius = sqrt(tone).mul(spacing).mul(Math.SQRT1_2).mul(u.dotSize!);
  const feather = max(0.001, u.softness!).mul(0.5);
  const ink = radius
    .greaterThan(0)
    .select(
      smoothstep(radius.sub(feather), radius.add(feather), length(grid.sub(cellCenter))).oneMinus(),
      0,
    );
  const patternAlpha = mix(u.backgroundOpacity!, u.foregroundOpacity!, ink).mul(original.a);
  const patternPremultiplied = mix(
    colors.background!.mul(u.backgroundOpacity!),
    colors.foreground!.mul(u.foregroundOpacity!),
    ink,
  ).mul(original.a);
  const alpha = mix(original.a, patternAlpha, controls.amount);
  const rgb = mix(original.rgb.mul(original.a), patternPremultiplied, controls.amount).div(
    max(alpha, 0.000001),
  );
  // Zero amount is the exact source, including fractional coverage and hidden RGB.
  return controls.amount.greaterThan(0).select(vec4(rgb, alpha), original);
}

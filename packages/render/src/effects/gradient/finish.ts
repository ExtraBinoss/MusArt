// MIT: ExtraBinoss / Plinka (2026), React-Beautiful-Gradient finishing pass.
import type { Node } from "three/webgpu";
import {
  abs,
  clamp,
  cos,
  distance,
  floor,
  length,
  max,
  min,
  mix,
  smoothstep,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { gradientPhase } from "./shared/field";
import { gradientHash } from "./shared/noise";
import { readGradient, treatmentControls } from "./treatments/shared";
export function gradientFinishNode(context: EffectNodeContext) {
  const u = treatmentControls(context),
    position = uv(),
    resolution = context.controls.resolution;
  const sample = readGradient(context, position),
    offset = position.sub(0.5).mul(u.chromaticShift);
  let color: Node<"vec3"> = vec3(
    readGradient(context, position.add(offset)).r,
    sample.g,
    readGradient(context, position.sub(offset)).b,
  );
  const grainPoint = floor(position.mul(resolution).div(u.grainScale));
  const noise = mix(
    gradientHash(grainPoint),
    gradientHash(grainPoint.add(vec3(37, 91, 0).xy)),
    cos(gradientPhase(u).mul(2)).mul(-0.5).add(0.5),
  );
  color = color.add(noise.sub(0.5).mul(u.grain).mul(0.5));
  color = color.mul(
    smoothstep(0.2, 0.8, distance(position, vec3(0.5).xy))
      .mul(u.vignette)
      .oneMinus(),
  );
  const radius = min(u.borderRadius, min(resolution.x, resolution.y).mul(0.5));
  const q = abs(position.mul(resolution).sub(resolution.mul(0.5))).sub(
    resolution.mul(0.5).sub(radius),
  );
  const sdf = length(max(q, 0))
    .add(min(max(q.x, q.y), 0))
    .sub(radius);
  const rounded = radius.greaterThan(0).select(smoothstep(-0.75, 0.75, sdf).oneMinus(), 1);
  const original = context.backdrop
    ? sampleEffect(
        context.backdrop,
        { ...context.controls, sourceFlipY: context.controls.backdropFlipY },
        position,
      )
    : sample;
  return vec4(clamp(color, 0, 1), sample.a.mul(original.a).mul(rounded));
}

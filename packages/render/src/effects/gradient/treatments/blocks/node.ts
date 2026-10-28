// MIT: ExtraBinoss / Plinka (2026), React-Beautiful-Gradient blocks pass.
import {
  abs,
  clamp,
  floor,
  fract,
  length,
  max,
  min,
  pow,
  smoothstep,
  uv,
  vec2,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";
import type { EffectNodeContext } from "../../../shared/context";
import { rotate } from "../../shared/field";
import { gradientHash } from "../../shared/noise";
import { mixRGBA, readGradient, treatmentControls } from "../shared";
export function blocksNode(context: EffectNodeContext) {
  const u = treatmentControls(context),
    resolution = context.controls.logicalResolution;
  const size = max(vec2(u.size.mul(u.aspect), u.size), 2),
    angle = u.treatmentRotation.mul(Math.PI / 180);
  const coord = rotate(uv().mul(resolution).sub(resolution.mul(0.5)), angle).div(size);
  const origin = floor(coord),
    fraction = fract(coord),
    feather = max(u.feather.mul(0.5), 0.0001);
  const blend = smoothstep(vec2(feather.negate().add(0.5)), vec2(feather.add(0.5)), fraction);
  const sample = (index: Node<"vec2">) => {
    const s = readGradient(
      context,
      rotate(index.mul(size), angle.negate()).add(resolution.mul(0.5)).div(resolution),
    );
    return vec4(
      clamp(s.rgb.mul(gradientHash(index.add(19.17)).sub(0.5).mul(u.variation).add(1)), 0, 1),
      s.a,
    );
  };
  const color = mixRGBA(
    mixRGBA(sample(origin), sample(origin.add(vec2(1, 0))), blend.x),
    mixRGBA(sample(origin.add(vec2(0, 1))), sample(origin.add(1)), blend.x),
    blend.y,
  );
  const local = fract(coord.add(0.5));
  const bevel = pow(local.x.oneMinus(), 10)
    .add(pow(local.y.oneMinus(), 10))
    .sub(pow(local.x, 10))
    .sub(pow(local.y, 10));
  const half = u.gap.negate().add(0.5),
    radius = min(u.roundness, half),
    q = abs(local.sub(0.5)).sub(half).add(radius);
  const distance = length(max(q, 0))
    .add(min(max(q.x, q.y), 0))
    .sub(radius);
  const pixel = max(context.controls.pixelFootprint.x, context.controls.pixelFootprint.y);
  const aa = min(size.x, size.y).reciprocal().mul(pixel).mul(0.65).add(u.feather.mul(0.06));
  return vec4(
    clamp(color.rgb.add(bevel.mul(u.relief).mul(0.35)), 0, 1),
    color.a.mul(
      u.gap
        .greaterThan(0)
        .or(u.roundness.greaterThan(0))
        .select(smoothstep(aa.negate(), aa, distance).oneMinus(), 1),
    ),
  );
}

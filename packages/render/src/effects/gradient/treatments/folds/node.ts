// MIT: ExtraBinoss / Plinka (2026), React-Beautiful-Gradient folds pass.
import { abs, clamp, cos, fract, max, mix, sign, sin, uv, vec2, vec4 } from "three/tsl";
import type { EffectNodeContext } from "../../../shared/context";
import { rotate } from "../../shared/field";
import { readGradient, treatmentControls } from "../shared";
export function foldsNode(context: EffectNodeContext) {
  const u = treatmentControls(context),
    resolution = context.controls.logicalResolution,
    size = max(2, u.size),
    angle = u.treatmentRotation.mul(Math.PI / 180);
  const p = rotate(uv().mul(resolution).sub(resolution.mul(0.5)), angle),
    direction = rotate(vec2(1, 0), angle.negate());
  const cycle = p.x.div(size).add(u.phase),
    phase = cycle.mul(Math.PI * 2);
  const triangle = abs(fract(cycle).sub(0.5)).mul(4).oneMinus();
  const profile = mix(triangle, cos(phase).negate(), u.softness),
    slope = mix(sign(sin(phase)), sin(phase), u.softness);
  const color = readGradient(
    context,
    uv().add(direction.mul(profile).mul(size).mul(u.depth).mul(0.12).div(resolution)),
  );
  const shading = max(slope, 0)
    .mul(u.highlight)
    .mul(0.38)
    .add(1)
    .sub(max(slope.negate(), 0).mul(u.shadow).mul(0.48));
  return vec4(clamp(color.rgb.mul(shading), 0, 1), color.a);
}

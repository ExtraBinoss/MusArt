import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { clamp, uv, vec3, vec4 } from "three/tsl";
export function tintNode({ source, controls }: EffectNodeContext) {
  const s = sampleEffect(source, controls, uv());
  const v = controls.amount.sub(0.5).mul(2);
  return vec4(clamp(s.rgb.add(vec3(v.mul(0.06), v.mul(-0.12), v.mul(0.06))), 0, 1), s.a);
}

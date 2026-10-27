import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { clamp, uv, vec3, vec4 } from "three/tsl";
export function temperatureNode({ source, controls }: EffectNodeContext) {
  const s = sampleEffect(source, controls, uv());
  const v = controls.amount.sub(0.5).mul(2);
  return vec4(clamp(s.rgb.add(vec3(v.mul(0.12), v.mul(0.02), v.mul(-0.12))), 0, 1), s.a);
}

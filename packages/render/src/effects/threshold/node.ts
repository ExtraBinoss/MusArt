import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { dot, step, uv, vec3, vec4 } from "three/tsl";
export function thresholdNode({ source, controls }: EffectNodeContext) {
  const s = sampleEffect(source, controls, uv());
  return vec4(vec3(step(controls.amount, dot(s.rgb, vec3(0.2126, 0.7152, 0.0722)))), s.a);
}

import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { clamp, saturation, uv, vec4 } from "three/tsl";
export function saturationNode({ source, controls }: EffectNodeContext) {
  const s = sampleEffect(source, controls, uv());
  return vec4(clamp(saturation(s.rgb, controls.amount.mul(2)), 0, 1), s.a);
}

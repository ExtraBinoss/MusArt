import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { clamp, hue, uv, vec4 } from "three/tsl";
export function hueNode({ source, controls }: EffectNodeContext) {
  const s = sampleEffect(source, controls, uv());
  return vec4(clamp(hue(s.rgb, controls.amount.sub(0.5).mul(Math.PI * 2)), 0, 1), s.a);
}

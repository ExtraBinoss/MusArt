import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { clamp, vibrance, uv, vec4 } from "three/tsl";
export function vibranceNode({ source, controls }: EffectNodeContext) {
  const s = sampleEffect(source, controls, uv());
  return vec4(clamp(vibrance(s.rgb, controls.amount.sub(0.5).mul(2)), 0, 1), s.a);
}

import { clamp, uv, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";

export function brightnessNode({ source, controls }: EffectNodeContext) {
  const sample = sampleEffect(source, controls, uv());
  return vec4(clamp(sample.rgb.add(controls.amount.sub(0.5).mul(2)), 0, 1), sample.a);
}

import { clamp, uv, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";

export function contrastNode({ source, controls }: EffectNodeContext) {
  const sample = sampleEffect(source, controls, uv());
  return vec4(clamp(sample.rgb.sub(0.5).mul(controls.amount.mul(2)).add(0.5), 0, 1), sample.a);
}

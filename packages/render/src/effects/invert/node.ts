import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { mix, uv, vec4 } from "three/tsl";
export function invertNode({ source, controls }: EffectNodeContext) {
  const s = sampleEffect(source, controls, uv());
  return vec4(mix(s.rgb, s.rgb.oneMinus(), controls.amount), s.a);
}

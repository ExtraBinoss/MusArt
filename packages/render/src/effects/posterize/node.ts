import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { floor, mix, uv, vec4 } from "three/tsl";
export function posterizeNode({ source, controls }: EffectNodeContext) {
  const s = sampleEffect(source, controls, uv());
  const c = floor(s.rgb.mul(controls.levels).add(0.5)).div(controls.levels);
  return vec4(mix(s.rgb, c, controls.amount), s.a);
}

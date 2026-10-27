import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { max, pow, uv, vec4 } from "three/tsl";
export function gammaNode({ source, controls }: EffectNodeContext) {
  const s = sampleEffect(source, controls, uv());
  const gamma = pow(2, controls.amount.sub(0.5).mul(4));
  return vec4(pow(max(s.rgb, 0), gamma.reciprocal()), s.a);
}

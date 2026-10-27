import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { clamp, length, mix, pow, uv, vec4 } from "three/tsl";
export function vignetteNode({ source, controls }: EffectNodeContext) {
  const s = sampleEffect(source, controls, uv());
  const radius = clamp(length(uv().sub(0.5).mul(1.41421356)), 0, 1);
  const shade = pow(radius, controls.scale.reciprocal()).mul(controls.amount).oneMinus();
  return vec4(mix(s.rgb, s.rgb.mul(shade), 1), s.a);
}

import { dot, mix, uv, vec3, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";

export function grayscaleNode({ source, controls }: EffectNodeContext) {
  const sample = sampleEffect(source, controls, uv());
  const luma = dot(sample.rgb, vec3(0.2126, 0.7152, 0.0722));
  return vec4(mix(sample.rgb, vec3(luma), controls.amount), sample.a);
}

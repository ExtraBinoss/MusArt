import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { clamp, dot, mix, uv, vec3, vec4 } from "three/tsl";
export function sepiaNode({ source, controls }: EffectNodeContext) {
  const s = sampleEffect(source, controls, uv());
  const tinted = vec3(
    dot(s.rgb, vec3(0.393, 0.769, 0.189)),
    dot(s.rgb, vec3(0.349, 0.686, 0.168)),
    dot(s.rgb, vec3(0.272, 0.534, 0.131)),
  );
  return vec4(clamp(mix(s.rgb, tinted, controls.amount), 0, 1), s.a);
}

import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { clamp, floor, mix, uv, vec2, vec3, vec4 } from "three/tsl";
import { noise2d } from "../shared/noise";
export function grainNode({ source, controls }: EffectNodeContext) {
  const p = floor(uv().mul(controls.logicalResolution).div(controls.scale));
  const s = sampleEffect(source, controls, uv());
  const mono = noise2d(p, controls.randomSeed);
  const colored = vec3(
    mono,
    noise2d(p.add(vec2(17, 31)), controls.randomSeed),
    noise2d(p.add(vec2(59, 7)), controls.randomSeed),
  );
  const n = mix(vec3(mono), colored, controls.color).sub(0.5);
  return vec4(clamp(s.rgb.add(n.mul(controls.amount).mul(0.7)), 0, 1), s.a);
}

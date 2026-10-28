import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { clamp, dot, floor, fract, length, mix, smoothstep, sqrt, uv, vec3, vec4 } from "three/tsl";
export function halftoneNode({ source, controls }: EffectNodeContext) {
  const pos = uv();
  const s = sampleEffect(source, controls, pos);
  const pixel = pos.mul(controls.logicalResolution).div(controls.scale);
  const center = floor(pixel).add(0.5).mul(controls.scale).div(controls.logicalResolution);
  const blocked = sampleEffect(source, controls, center);
  const luma = clamp(dot(blocked.rgb, vec3(0.2126, 0.7152, 0.0722)), 0, 1);
  const radius = sqrt(luma.oneMinus()).mul(0.7071);
  const ink = smoothstep(
    radius.sub(0.025),
    radius.add(0.025),
    length(fract(pixel).sub(0.5)),
  ).oneMinus();
  const mono = vec3(ink.oneMinus());
  const colored = mix(vec3(1), blocked.rgb, ink);
  return vec4(mix(s.rgb, mix(mono, colored, controls.color), controls.amount), s.a);
}

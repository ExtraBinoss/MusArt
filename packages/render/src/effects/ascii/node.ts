import { clamp, dot, floor, fract, mix, texture, uv, vec2, vec3, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";

export function asciiNode({ source, controls, getGlyphAtlas }: EffectNodeContext) {
  const position = uv();
  const sample = sampleEffect(source, controls, position);
  const pixel = position.mul(controls.resolution);
  const size = vec2(controls.scale.mul(0.65), controls.scale);
  const cell = floor(pixel.div(size));
  const blocked = sampleEffect(source, controls, cell.add(0.5).mul(size).div(controls.resolution));
  const brightness = clamp(dot(blocked.rgb, vec3(0.2126, 0.7152, 0.0722)), 0, 0.9999);
  const glyph = floor(brightness.mul(16));
  const local = fract(pixel.div(size));
  const ink = texture(getGlyphAtlas(), vec2(glyph.add(local.x).div(16), local.y)).r;
  const color = mix(vec3(brightness), blocked.rgb, controls.color);
  return vec4(mix(sample.rgb, color.mul(ink), controls.amount), sample.a);
}

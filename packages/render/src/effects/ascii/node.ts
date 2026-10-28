import { clamp, dot, floor, fract, mix, texture, uv, vec2, vec3, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import { sampleEffect, type EffectNodeContext } from "../shared/context";

export function asciiNode({ source, controls, getGlyphAtlas }: EffectNodeContext) {
  const position = uv();
  const sample = sampleEffect(source, controls, position);
  const pixel = position.mul(controls.logicalResolution);
  const size = vec2(controls.scale.mul(0.65), controls.scale);
  const cell = floor(pixel.div(size));
  const blocked = sampleEffect(
    source,
    controls,
    cell.add(0.5).mul(size).div(controls.logicalResolution),
  );
  const brightness = clamp(dot(blocked.rgb, vec3(0.2126, 0.7152, 0.0722)), 0, 0.9999);
  const glyph = floor(brightness.mul(16));
  const local = fract(pixel.div(size));
  const atlas = getGlyphAtlas();
  const footprint = controls.pixelFootprint.div(size).mul(0.25);
  // Integrate glyph coverage over the output pixel instead of undersampling the
  // sixteen-pixel atlas. Clamp inside its cell to keep adjacent glyphs isolated.
  const inkAt = (offset: Node<"vec2">) => {
    const point = clamp(local.add(offset), vec2(0.5 / 16), vec2(1 - 0.5 / 16));
    return texture(atlas, vec2(glyph.add(point.x).div(16), point.y)).r;
  };
  const ink = inkAt(footprint)
    .add(inkAt(footprint.negate()))
    .add(inkAt(vec2(footprint.x, footprint.y.negate())))
    .add(inkAt(vec2(footprint.x.negate(), footprint.y)))
    .mul(0.25);
  const color = mix(vec3(brightness), blocked.rgb, controls.color);
  return vec4(mix(sample.rgb, color.mul(ink), controls.amount), sample.a);
}

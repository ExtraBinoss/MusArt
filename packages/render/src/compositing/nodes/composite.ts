import { Matrix3, Texture, Vector2, type TextureNode } from "three/webgpu";
import { clamp, dot, max, mix, step, texture, uniform, uv, vec2, vec3, vec4 } from "three/tsl";

import { textureUv } from "./uv";
import { blendRGB } from "../blends/registry";

export function sourceControls() {
  return {
    source: texture(new Texture()),
    opacity: uniform(1),
    premultiplied: uniform(0),
    flipY: uniform(0),
  };
}
export type SourceControls = ReturnType<typeof sourceControls>;
export function normalNode(controls: SourceControls) {
  const sample = controls.source.sample(textureUv(controls.flipY));
  const straight = mix(sample.rgb, sample.rgb.div(max(sample.a, 0.000001)), controls.premultiplied);
  // NodeMaterial.premultipliedAlpha applies the multiplication and selects ONE blend factors.
  return vec4(straight, sample.a.mul(controls.opacity));
}
export function copyControls() {
  return {
    source: texture(new Texture()),
    normalize: uniform(0),
    premultiply: uniform(0),
    flipY: uniform(0),
  };
}
export function copyNode(controls: ReturnType<typeof copyControls>) {
  const sample = controls.source.sample(textureUv(controls.flipY));
  return vec4(
    mix(sample.rgb, sample.rgb.div(max(sample.a, 0.000001)), controls.normalize).mul(
      mix(1, sample.a, controls.premultiply),
    ),
    sample.a,
  );
}
export function maskControls() {
  return {
    source: texture(new Texture()),
    mask: texture(new Texture()),
    inverted: uniform(0),
    maskFlipY: uniform(0),
    maskPremultiplied: uniform(0),
    maskOpacity: uniform(1),
    luminance: uniform(0),
    transformed: uniform(0),
    targetSize: uniform(new Vector2(1, 1)),
    sourceSize: uniform(new Vector2(1, 1)),
    inverse: uniform(new Matrix3()),
    premultiplied: uniform(0),
    flipY: uniform(0),
  };
}
export function maskNode(controls: ReturnType<typeof maskControls>) {
  const sample = controls.source.sample(textureUv(controls.flipY));
  const point = controls.inverse.mul(
    vec3(uv().x.mul(controls.targetSize.x), uv().y.oneMinus().mul(controls.targetSize.y), 1),
  );
  const mapped = vec2(
    point.x.div(controls.sourceSize.x),
    point.y.div(controls.sourceSize.y).oneMinus(),
  );
  const coord = mix(uv(), mapped, controls.transformed);
  const inside = step(0, coord.x).mul(step(coord.x, 1)).mul(step(0, coord.y)).mul(step(coord.y, 1));
  const bounded = clamp(coord, 0, 1);
  const mask = controls.mask.sample(
    vec2(bounded.x, mix(bounded.y, bounded.y.oneMinus(), controls.maskFlipY)),
  );
  const rgb = mix(mask.rgb, mask.rgb.div(max(mask.a, 0.000001)), controls.maskPremultiplied);
  const intensity = mix(1, dot(rgb, vec3(0.2126, 0.7152, 0.0722)), controls.luminance);
  const coverage = clamp(mask.a.mul(intensity).mul(controls.maskOpacity).mul(inside), 0, 1);
  const alpha = mix(coverage, coverage.oneMinus(), controls.inverted);
  return vec4(sample.rgb.mul(mix(1, alpha, controls.premultiplied)), sample.a.mul(alpha));
}
export function blendControls() {
  return {
    source: texture(new Texture()),
    backdrop: texture(new Texture()),
    backdropFlipY: uniform(0),
    opacity: uniform(1),
    premultiplied: uniform(0),
    flipY: uniform(0),
    mode: uniform(0),
    parentSize: uniform(new Vector2(1, 1)),
    sourceSize: uniform(new Vector2(1, 1)),
    inverse: uniform(new Matrix3()),
  };
}
function sampleSource(source: TextureNode<"vec4">, controls: ReturnType<typeof blendControls>) {
  const dest = vec3(
    uv().x.mul(controls.parentSize.x),
    uv().y.oneMinus().mul(controls.parentSize.y),
    1,
  );
  const local = controls.inverse.mul(dest);
  const coord = vec2(
    local.x.div(controls.sourceSize.x),
    local.y.div(controls.sourceSize.y).oneMinus(),
  );
  const inside = step(0, coord.x).mul(step(coord.x, 1)).mul(step(0, coord.y)).mul(step(coord.y, 1));
  const bounded = clamp(coord, 0, 1);
  const corrected = vec2(bounded.x, mix(bounded.y, bounded.y.oneMinus(), controls.flipY));
  const pixel = source.sample(corrected);
  return vec4(pixel.rgb, pixel.a.mul(inside));
}
/** W3C blend function followed by Porter-Duff source-over, output premultiplied. */
export function blendNode(controls: ReturnType<typeof blendControls>) {
  const s = sampleSource(controls.source, controls);
  const b = controls.backdrop.sample(textureUv(controls.backdropFlipY));
  const cs = mix(s.rgb, s.rgb.div(max(s.a, 0.000001)), controls.premultiplied);
  const cb = b.rgb.div(max(b.a, 0.000001));
  const blended = blendRGB(cb, cs, controls.mode);
  const alpha = s.a.mul(controls.opacity);
  const color = cs
    .mul(b.a.oneMinus())
    .add(blended.mul(b.a))
    .mul(alpha)
    .add(b.rgb.mul(alpha.oneMinus()));
  return vec4(color, alpha.add(b.a.mul(alpha.oneMinus())));
}

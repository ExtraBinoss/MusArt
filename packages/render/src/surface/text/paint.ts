import type { Layer } from "@musart/core";
import { Vector2, Vector4 } from "three/webgpu";
import {
  abs,
  Fn,
  If,
  attribute,
  clamp,
  cos,
  length,
  max,
  mix,
  sin,
  uniform,
  varying,
  vec2,
  vec4,
} from "three/tsl";
import { parseColor } from "../../compositing/nodes/color";

export function textPaint() {
  return {
    solid: uniform(new Vector4()),
    size: uniform(new Vector2(1, 1)),
    mode: uniform(0),
    angle: uniform(0),
    colors: Array.from({ length: 8 }, () => uniform(new Vector4())),
    offsets: Array.from({ length: 8 }, () => uniform(1)),
    count: uniform(2),
  };
}
export function updateTextPaint(controls: ReturnType<typeof textPaint>, layer: Layer): void {
  controls.solid.value.copy(parseColor(layer.fill));
  controls.size.value.set(layer.width, layer.height);
  const gradient = layer.fillGradient;
  controls.mode.value = gradient ? (gradient.kind === "linear" ? 1 : 2) : 0;
  controls.angle.value = ((gradient?.angle ?? 0) * Math.PI) / 180;
  controls.count.value = gradient?.stops.length ?? 2;
  for (let index = 0; index < 8; index++) {
    const stop = gradient?.stops[Math.min(index, gradient.stops.length - 1)];
    controls.colors[index]!.value.copy(parseColor(stop?.color ?? layer.fill));
    controls.offsets[index]!.value = stop?.offset ?? (index ? 1 : 0);
  }
}
export const textPaintNode = (controls: ReturnType<typeof textPaint>) =>
  Fn(() => {
    const placement = attribute("glyphPosition", "vec4");
    const pixel = varying(attribute("uv", "vec2").mul(placement.zw).add(placement.xy));
    const point = pixel.div(controls.size).toVar();
    const direction = vec2(cos(controls.angle), sin(controls.angle)).toVar();
    const projected = pixel
      .sub(controls.size.mul(0.5))
      .dot(direction)
      .div(max(abs(direction).dot(controls.size), 0.000001))
      .add(0.5);
    const radial = length(point.sub(0.5)).mul(2);
    const position = clamp(controls.mode.equal(2).select(radial, projected), 0, 1).toVar();
    // Fixed graph size; colors/offsets/count remain live uniforms across gestures.
    const result = vec4(controls.colors[0]!).toVar();
    for (let index = 1; index < 8; index++) {
      If(controls.count.greaterThan(index), () => {
        const before = controls.offsets[index - 1]!,
          after = controls.offsets[index]!;
        const smooth = clamp(position.sub(before).div(max(after.sub(before), 0.000001)), 0, 1);
        const alpha = after
          .equal(before)
          .select(position.greaterThanEqual(after).select(1, 0), smooth);
        result.assign(mix(result, controls.colors[index]!, alpha));
      });
    }
    return controls.mode.equal(0).select(controls.solid, result);
  })();

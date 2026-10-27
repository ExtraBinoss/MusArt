import type { Layer } from "@musart/core";
import { Vector2, Vector4 } from "three/webgpu";
import { abs, length, max, min, mix, smoothstep, uniform, uv, vec4 } from "three/tsl";
import { parseColor } from "../compositing/nodes/color";
export function shapeControls() {
  return {
    size: uniform(new Vector2(1, 1)),
    radius: uniform(0),
    strokeWidth: uniform(0),
    ellipse: uniform(0),
    fill: uniform(new Vector4(0, 0, 0, 1)),
    stroke: uniform(new Vector4(0, 0, 0, 0)),
  };
}
export function updateShape(
  controls: ReturnType<typeof shapeControls>,
  layer: Layer,
  scale: number,
): void {
  controls.size.value.set(layer.width * scale, layer.height * scale);
  controls.radius.value = Math.min(layer.radius, layer.width / 2, layer.height / 2) * scale;
  controls.strokeWidth.value = layer.strokeWidth * scale;
  controls.ellipse.value = layer.kind === "ellipse" ? 1 : 0;
  controls.fill.value.copy(parseColor(layer.fill));
  controls.stroke.value.copy(parseColor(layer.stroke));
}
export function shapeNode(controls: ReturnType<typeof shapeControls>) {
  const half = controls.size.mul(0.5);
  const p = abs(uv().sub(0.5).mul(controls.size));
  const q = p.sub(half).add(controls.radius);
  const rect = length(max(q, 0))
    .add(min(max(q.x, q.y), 0))
    .sub(controls.radius);
  const circle = length(p.div(half)).sub(1).mul(min(half.x, half.y));
  const distance = mix(rect, circle, controls.ellipse);
  const fillAlpha = smoothstep(0.5, -0.5, distance).mul(controls.fill.a);
  const strokeAlpha = smoothstep(0.5, -0.5, abs(distance).sub(controls.strokeWidth.mul(0.5)))
    .mul(controls.stroke.a)
    .mul(controls.strokeWidth.greaterThan(0).select(1, 0));
  const alpha = strokeAlpha.add(fillAlpha.mul(strokeAlpha.oneMinus()));
  const color = controls.stroke.rgb
    .mul(strokeAlpha)
    .add(controls.fill.rgb.mul(fillAlpha).mul(strokeAlpha.oneMinus()))
    .div(max(alpha, 0.000001));
  return vec4(color, alpha);
}

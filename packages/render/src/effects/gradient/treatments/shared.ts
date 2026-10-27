import type { Node } from "three/webgpu";
import { clamp, max, mix, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../../shared/context";
export function readGradient(context: EffectNodeContext, coord: Node<"vec2">) {
  const edge = context.controls.resolution.reciprocal().mul(0.5);
  return sampleEffect(context.source, context.controls, clamp(coord, edge, edge.oneMinus()));
}
export const premultiply = (color: Node<"vec4">) => vec4(color.rgb.mul(color.a), color.a);
export const unpremultiply = (color: Node<"vec4">) =>
  vec4(color.rgb.div(max(color.a, 0.000001)), color.a);
export const mixRGBA = (a: Node<"vec4">, b: Node<"vec4">, t: Node<"float">) =>
  unpremultiply(mix(premultiply(a), premultiply(b), t));
export function treatmentControls(context: EffectNodeContext) {
  if (!context.controls.gradient) throw new Error("Gradient uniforms are missing.");
  return context.controls.gradient;
}

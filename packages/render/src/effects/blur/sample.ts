import type { Node } from "three/webgpu";
import { Fn, clamp, floor, fract, mix, vec2, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
/** Interpolate premultiplied texels explicitly, independent of a source's sampler policy. */
export function samplePremultiplied(context: EffectNodeContext, position: Node<"vec2">) {
  return Fn(([position]: readonly [Node<"vec2">]) => {
    const size = context.controls.resolution;
    const pixel = position.mul(size).sub(0.5),
      base = floor(pixel),
      part = fract(pixel);
    const read = (offset: Node<"vec2">) => {
      const coord = base.add(offset).add(0.5).div(size);
      const inside = coord.x
        .greaterThanEqual(0)
        .and(coord.x.lessThanEqual(1))
        .and(coord.y.greaterThanEqual(0))
        .and(coord.y.lessThanEqual(1));
      const value = sampleEffect(context.source, context.controls, clamp(coord, 0, 1)).toVar();
      return vec4(value.rgb.mul(value.a), value.a).mul(inside.select(1, 0));
    };
    return mix(
      mix(read(vec2(0)), read(vec2(1, 0)), part.x),
      mix(read(vec2(0, 1)), read(vec2(1)), part.x),
      part.y,
    );
  })(position);
}

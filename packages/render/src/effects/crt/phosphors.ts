import type { Node } from "three/webgpu";
import { Fn, abs, floor, fract, length, max, smoothstep, vec2, vec3 } from "three/tsl";

/** Authored screen-space phosphors, independent of viewport zoom and export density. */
export const crtPhosphors = Fn(
  ([pixel, pitch, gap, pattern]: [Node<"vec2">, Node<"float">, Node<"float">, Node<"float">]) => {
    const position = pixel.div(max(pitch, 1)).toVar(),
      rowPitch = pattern.lessThan(1.5).select(1.25, 3).toVar(),
      row = floor(position.y.div(rowPitch)).toVar(),
      stagger = fract(row.mul(0.5)).mul(1.5),
      x = position.x.add(pattern.lessThan(0.5).select(0, stagger)).toVar(),
      channel = floor(fract(x.div(3)).mul(3)).toVar(),
      primary = vec3(
        channel.lessThan(1).select(1, 0),
        channel.equal(1).select(1, 0),
        channel.greaterThan(1).select(1, 0),
      ),
      horizontal = abs(fract(x).sub(0.5)).mul(2).toVar(),
      vertical = abs(fract(position.y.div(rowPitch)).sub(0.5))
        .mul(2)
        .toVar(),
      feather = 0.08,
      aperture = smoothstep(gap.oneMinus().sub(feather), gap.oneMinus(), horizontal)
        .oneMinus()
        .toVar(),
      dot = smoothstep(
        gap.oneMinus().mul(0.78),
        gap.oneMinus(),
        length(vec2(horizontal, vertical.mul(rowPitch))),
      )
        .oneMinus()
        .toVar(),
      slotCorner = vec2(horizontal, vertical).sub(vec2(0.65, 0.55)).toVar(),
      slotDistance = length(max(slotCorner, 0))
        .add(max(slotCorner.x, slotCorner.y).min(0))
        .sub(0.25),
      slot = smoothstep(-0.04, 0.04, slotDistance).oneMinus().toVar(),
      shape = pattern
        .lessThan(0.5)
        .select(aperture, pattern.lessThan(1.5).select(dot, slot.mul(aperture)));
    return primary.mul(1.5).mul(shape);
  },
);

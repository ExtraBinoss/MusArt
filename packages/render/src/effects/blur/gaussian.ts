import type { Node } from "three/webgpu";
import { Fn, max, uv, vec2, vec4 } from "three/tsl";
import type { EffectNodeContext } from "../shared/context";
import { samplePremultiplied } from "./sample";
/** Bounded separable Gaussian, accumulated in premultiplied RGBA to avoid dark fringes. */
export function gaussianAxis(
  context: EffectNodeContext,
  axis: "x" | "y",
  radius: Node<"float">,
  offset: Node<"vec2"> = vec2(0),
) {
  return Fn(() => {
    const position = uv().sub(offset.div(context.controls.logicalResolution));
    const direction = axis === "x" ? vec2(1, 0) : vec2(0, 1);
    const step = direction.mul(radius).div(context.controls.logicalResolution).div(2.5);
    const total = vec4(0).toVar();
    let weight = 0;
    for (let i = -8; i <= 8; i++) {
      const w = Math.exp(-0.5 * (i / 2.5) ** 2);
      weight += w;
      const coord = position.add(step.mul(i));
      total.addAssign(samplePremultiplied(context, coord).mul(w));
    }
    const alpha = total.a.div(weight);
    return vec4(total.rgb.div(max(total.a, 0.000001)), alpha);
  })();
}

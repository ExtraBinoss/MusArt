import { Fn, clamp, mix, uv, vec2, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { mixEffectCoverage } from "../shared/compositing/node";
import { receiptInk } from "./printing";
import { receiptPaper } from "./paper";

/** Thermal-photo print and procedural paper; the source owns the silhouette by default. */
export function receiptNode(context: EffectNodeContext) {
  const { source, controls } = context,
    u = controls.parameters,
    original = sampleEffect(source, controls, uv());
  const processed = Fn(() => {
    const pixel = vec2(uv().x, uv().y.oneMinus()).mul(controls.logicalResolution).toVar(),
      paper = receiptPaper(pixel, controls).toVar(),
      ink = receiptInk(pixel, context).toVar(),
      color = clamp(
        mix(controls.colors.paperColor!, controls.colors.inkColor!, ink).mul(paper.y).add(paper.z),
        0,
        1,
      ),
      outside = vec4(color, original.a.mul(u.cutout!.oneMinus())),
      inside = vec4(color, original.a);
    return mixEffectCoverage(outside, inside, paper.x);
  })();
  return mixEffectCoverage(original, processed, controls.amount);
}

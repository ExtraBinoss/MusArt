import { EFFECT_COMPOSITE_MODES } from "@musart/core";
import type { Node } from "three/webgpu";
import { Fn, If, clamp, max, mix, vec2, vec4 } from "three/tsl";
import { blendRGB } from "../../../compositing/blends/registry";
import type { EffectUniforms } from "../uniforms";
/** Mix image treatments in premultiplied space when an effect can remove coverage.
 * Both inputs are materialized before selection, keeping TSL temporaries in scope. */
export function mixEffectCoverage(
  backdrop: Node<"vec4">,
  processed: Node<"vec4">,
  amount: Node<"float">,
) {
  return Fn(
    ([backdrop, processed, amount]: readonly [Node<"vec4">, Node<"vec4">, Node<"float">]) => {
      const from = backdrop.toVar(),
        to = processed.toVar(),
        weight = amount.toVar();
      const alpha = mix(from.a, to.a, weight);
      const rgb = mix(from.rgb.mul(from.a), to.rgb.mul(to.a), weight);
      return weight.greaterThan(0).select(vec4(rgb.div(max(alpha, 0.000001)), alpha), from);
    },
  )(backdrop, processed, amount);
}
/** Straight-alpha effect replacement by default; explicit Porter-Duff is opt-in. */
export function compositeEffect(
  backdrop: Node<"vec4">,
  processed: Node<"vec4">,
  u: EffectUniforms,
  advanced = true,
) {
  if (!advanced) {
    const alpha = mix(backdrop.a, processed.a, u.opacity);
    const rgb = mix(backdrop.rgb.mul(backdrop.a), processed.rgb.mul(processed.a), u.opacity);
    return vec4(rgb.div(max(alpha, 0.000001)), alpha);
  }
  return Fn(() => {
    const b = backdrop.toVar(),
      s = processed.toVar();
    const blended = blendRGB(b.rgb, s.rgb, u.blendMode);
    const amount = u.opacity;
    const alpha = mix(b.a, s.a, amount);
    const premultiplied = mix(b.rgb.mul(b.a), blended.mul(s.a), amount);
    const result = vec4(premultiplied.div(max(alpha, 0.000001)), alpha).toVar();
    If(u.composite.greaterThanEqual(0), () => {
      const sa = s.a.mul(amount),
        factors = vec2(1, sa.oneMinus()).toVar();
      const rules = [
        vec2(1, sa.oneMinus()),
        vec2(b.a.oneMinus(), 1),
        vec2(b.a, 0),
        vec2(0, sa),
        vec2(b.a.oneMinus(), 0),
        vec2(0, sa.oneMinus()),
        vec2(b.a, sa.oneMinus()),
        vec2(b.a.oneMinus(), sa),
        vec2(b.a.oneMinus(), sa.oneMinus()),
        vec2(1, 0),
        vec2(0, 1),
        vec2(0),
        vec2(1),
      ];
      EFFECT_COMPOSITE_MODES.forEach((_mode, i) =>
        If(u.composite.equal(i), () => {
          factors.assign(rules[i]!);
        }),
      );
      const a = clamp(sa.mul(factors.x).add(b.a.mul(factors.y)), 0, 1);
      const rgb = mix(s.rgb, blended, b.a)
        .mul(sa)
        .mul(factors.x)
        .add(b.rgb.mul(b.a).mul(factors.y));
      result.assign(vec4(rgb.div(max(a, 0.000001)), a));
    });
    return result;
  })();
}

import { Fn, If, clamp, min, vec4 } from "three/tsl";
import type { EffectNodeContext } from "../shared/context";
import { mixEffectCoverage } from "../shared/compositing/node";
import { transitionField, withCoverage, type TransitionOperator } from "./shared";

/** Uniform endpoint branches skip the expensive operator when its exact endpoint is shown. */
export function transitionNode(context: EffectNodeContext, operator: TransitionOperator) {
  const field = transitionField(context);
  return Fn(() => {
    const original = field.original.toVar();
    const local = { ...field, original };
    const result = vec4(0).toVar();
    If(field.progress.greaterThanEqual(1), () => {
      result.assign(original);
    }).Else(() => {
      const processed = vec4(0).toVar();
      If(field.progress.greaterThan(0), () => {
        const faded = withCoverage(original, field.progress).toVar();
        If(field.strength.lessThanEqual(0), () => {
          processed.assign(faded);
        }).Else(() => {
          const transformed = operator(local).toVar();
          const reduced = vec4(transformed.rgb, min(transformed.a, original.a));
          processed.assign(mixEffectCoverage(faded, reduced, clamp(field.strength, 0, 1)));
        });
      });
      result.assign(mixEffectCoverage(original, processed, context.controls.amount));
    });
    return result;
  })();
}

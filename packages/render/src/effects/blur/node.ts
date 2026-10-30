import type { EffectNodeContext } from "../shared/context";
import { gaussianAxis } from "./gaussian";
export function blurNode(context: EffectNodeContext) {
  return gaussianAxis(context, "x", context.controls.amount.mul(context.controls.scale));
}
export function blurVerticalNode(context: EffectNodeContext) {
  return gaussianAxis(context, "y", context.controls.amount.mul(context.controls.scale));
}

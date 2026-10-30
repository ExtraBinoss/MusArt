import { max, uv, vec2, vec4 } from "three/tsl";
import { gaussianAxis } from "../blur/gaussian";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
export function shadowHorizontalNode(context: EffectNodeContext) {
  const u = context.controls.parameters;
  return gaussianAxis(context, "x", u.radius!, vec2(u.offsetX!, u.offsetY!.negate()));
}
export function shadowNode(context: EffectNodeContext) {
  const controls = context.controls;
  const soft = gaussianAxis(context, "y", controls.parameters.radius!);
  const original = sampleEffect(
    context.backdrop!,
    { ...controls, sourceFlipY: controls.backdropFlipY },
    uv(),
  );
  const behind = soft.a.mul(controls.amount).mul(original.a.oneMinus());
  const alpha = original.a.add(behind);
  return vec4(
    original.rgb
      .mul(original.a)
      .add(controls.colors.shadowColor!.mul(behind))
      .div(max(alpha, 0.000001)),
    alpha,
  );
}

import type { Node } from "three/webgpu";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { clamp, pow, sRGBTransferEOTF, sRGBTransferOETF, uv, vec4 } from "three/tsl";
export function exposureNode({ source, controls }: EffectNodeContext) {
  const s = sampleEffect(source, controls, uv());
  const gain = pow(2, controls.amount.sub(0.5).mul(8));
  return vec4(
    sRGBTransferOETF(
      clamp((sRGBTransferEOTF(s.rgb) as Node<"vec3">).mul(gain), 0, 1),
    ) as Node<"vec3">,
    s.a,
  );
}

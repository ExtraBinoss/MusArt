import { uv, vec2, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";

export function blurNode({ source, controls }: EffectNodeContext) {
  const position = uv();
  const sample = sampleEffect(source, controls, position);
  const step = controls.amount.mul(controls.scale).div(controls.resolution);
  const sum = sample.rgb
    .mul(4)
    .add(sampleEffect(source, controls, position.add(vec2(step.x, 0))).rgb)
    .add(sampleEffect(source, controls, position.sub(vec2(step.x, 0))).rgb)
    .add(sampleEffect(source, controls, position.add(vec2(0, step.y))).rgb)
    .add(sampleEffect(source, controls, position.sub(vec2(0, step.y))).rgb);
  return vec4(sum.div(8), sample.a);
}

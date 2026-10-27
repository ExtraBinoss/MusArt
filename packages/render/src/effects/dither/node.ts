import { clamp, dot, floor, mix, uv, vec3, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { bayer4 } from "./bayer";

export function ditherNode({ source, controls }: EffectNodeContext) {
  const position = uv();
  const sample = sampleEffect(source, controls, position);
  const cell = floor(position.mul(controls.resolution).div(controls.scale));
  const blocked = sampleEffect(
    source,
    controls,
    cell.add(0.5).mul(controls.scale).div(controls.resolution),
  );
  const luma = vec3(dot(blocked.rgb, vec3(0.2126, 0.7152, 0.0722)));
  const channel = mix(luma, blocked.rgb, controls.color);
  const threshold = bayer4(cell.add(controls.seed)).sub(0.5);
  const quantized = clamp(
    floor(channel.mul(controls.levels).add(0.5).add(threshold)).div(controls.levels),
    0,
    1,
  );
  return vec4(mix(sample.rgb, quantized, controls.amount), sample.a);
}

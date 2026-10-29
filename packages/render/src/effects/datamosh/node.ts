import type { Node } from "three/webgpu";
import { Fn, clamp, cos, floor, max, mix, mod, sin, uv, vec2, vec3, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { noise2d } from "../shared/noise";

/** Native source lookup in Y-down authored document pixels. */
function read(context: EffectNodeContext, pixel: Node<"vec2">) {
  const coord = pixel.div(context.controls.logicalResolution);
  return sampleEffect(context.source, context.controls, vec2(coord.x, coord.y.oneMinus()));
}

/** Spatial codec-inspired corruption; no previous frame or decoder state exists. */
export function datamoshNode(context: EffectNodeContext) {
  const { source, controls } = context,
    u = controls.parameters;
  const original = sampleEffect(source, controls, uv());
  const processed = Fn(() => {
    const position = uv(),
      pixel = vec2(position.x, position.y.oneMinus()).mul(controls.logicalResolution).toVar();
    const phase = mod(floor(controls.time.mul(u.rate!)), 4096).toVar();
    const cell = floor(pixel.div(max(2, u.blockSize!))).toVar();
    const phaseOffset = vec2(phase.mul(37), phase.mul(71)).toVar();
    const at = cell.add(phaseOffset).toVar(),
      row = vec2(0, cell.y).add(phaseOffset).toVar();
    const blockAngle = noise2d(at.add(vec2(11, 3)), controls.randomSeedUint)
      .mul(2)
      .sub(1)
      .toVar();
    const rowAngle = noise2d(row.add(vec2(17, 13)), controls.randomSeedUint)
      .mul(2)
      .sub(1)
      .toVar();
    const variation = mix(blockAngle, rowAngle, u.coherence!).toVar();
    const angle = u
      .direction!.add(variation.mul(u.angleVariation!))
      .mul(Math.PI / 180)
      .toVar();
    const direction = vec2(cos(angle), sin(angle)).toVar();
    const magnitude = mix(
      noise2d(at.add(vec2(37, 59)), controls.randomSeedUint),
      noise2d(row.add(vec2(7, 43)), controls.randomSeedUint),
      u.coherence!,
    )
      .mul(0.65)
      .add(0.35)
      .toVar();
    const motion = direction.mul(u.displacement!).mul(magnitude).toVar();
    const displaced = pixel.sub(motion).toVar();
    const center = read(context, displaced).toVar();
    // Four fixed spatial taps retain photographic detail without a history buffer.
    const trail = center.rgb
      .mul(0.4)
      .add(read(context, displaced.add(motion.mul(1 / 3))).rgb.mul(0.3))
      .add(read(context, displaced.add(motion.mul(2 / 3))).rgb.mul(0.2))
      .add(original.rgb.mul(0.1))
      .toVar();
    const split = direction.mul(u.chromaShift!).toVar();
    const chroma = vec3(
      read(context, displaced.add(split)).r.sub(center.r),
      0,
      read(context, displaced.sub(split)).b.sub(center.b),
    ).toVar();
    const image = clamp(mix(center.rgb, trail, u.smear!).add(chroma), 0, 1).toVar();
    const steps = max(1, controls.levels).toVar();
    const quantized = floor(image.mul(steps).add(0.5)).div(steps).toVar();
    // Max precision keeps interpolated samples continuous until the common
    // premultiplied output, rather than quantizing their straight RGB twice.
    const encoded = steps.greaterThanEqual(255).select(image, quantized).toVar();
    const random = noise2d(at.add(vec2(97, 101)), controls.randomSeedUint).toVar();
    // All shared expressions exist before selects, avoiding branch-local cached temporaries.
    const active = u
      .density!.greaterThanEqual(1)
      .select(1, random.lessThan(u.density!).select(1, 0))
      .toVar();
    const hasTransform = u
      .displacement!.greaterThan(0)
      .or(u.chromaShift!.greaterThan(0))
      .or(steps.lessThan(255))
      .toVar();
    const amount = controls.amount.mul(active).mul(hasTransform.select(1, 0)).toVar();
    return amount.greaterThan(0).select(mix(original.rgb, encoded, amount), original.rgb);
  })();
  return vec4(processed, original.a);
}

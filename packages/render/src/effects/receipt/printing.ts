import {
  Fn,
  abs,
  clamp,
  dot,
  float,
  floor,
  max,
  min,
  mix,
  pow,
  sin,
  smoothstep,
  uint,
  vec2,
  vec3,
} from "three/tsl";
import type { Node } from "three/webgpu";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { noise2d } from "../shared/noise";
import { bayer4 } from "../dither/bayer";

/** Nine bounded neighboring thermal stamps allow actual ink spread across print-cell edges. */
export function receiptInk(pixel: Node<"vec2">, { source, controls }: EffectNodeContext) {
  const u = controls.parameters;
  return Fn(() => {
    const resolution = controls.logicalResolution,
      requestedMargin = vec2(u.marginX!, u.marginY!).mul(resolution).toVar(),
      available = resolution.sub(requestedMargin.mul(2)).toVar(),
      fitScale = min(available.x.div(resolution.x), available.y.div(resolution.y)),
      printSize = mix(resolution.mul(fitScale), available, u.fit!).toVar(),
      margin = resolution.sub(printSize).mul(0.5).toVar(),
      point = pixel.sub(margin).div(controls.scale).toVar(),
      cell = floor(point).toVar(),
      ink = float(0).toVar(),
      halfTexel = vec2(0.5).div(controls.resolution);
    for (const y of [-1, 0, 1])
      for (const x of [-1, 0, 1]) {
        const neighbor = cell.add(vec2(x, y)).toVar(),
          center = neighbor.add(0.5).toVar(),
          coord = clamp(center.mul(controls.scale).div(printSize), halfTexel, halfTexel.oneMinus()),
          sample = sampleEffect(source, controls, vec2(coord.x, coord.y.oneMinus())),
          luma = mix(1, dot(sample.rgb, vec3(0.2126, 0.7152, 0.0722)), sample.a),
          tone = clamp(
            pow(luma, float(1).div(u.gamma!)).sub(0.5).mul(u.contrast!).add(0.5).add(u.exposure!),
            0,
            1,
          ),
          inverted = mix(tone, tone.oneMinus(), u.invert!),
          random = noise2d(neighbor.add(1048576), controls.randomSeedUint).toVar(),
          ordered = bayer4(neighbor.add(controls.seed)).toVar(),
          threshold = u
            .mode!.lessThan(0.5)
            .select(ordered, u.mode!.lessThan(1.5).select(random, 0.5)),
          printed = inverted.lessThan(threshold).select(1, 0),
          survival = noise2d(neighbor.add(1048576), controls.randomSeedUint.add(uint(313)))
            .greaterThanEqual(u.wear!)
            .and(u.wear!.lessThan(1))
            .select(1, 0),
          relative = abs(point.sub(center)),
          distance = max(relative.x, relative.y),
          radius = u.dotSpread!.add(0.5),
          feather = u.dotSoftness!.mul(0.5),
          shape = smoothstep(radius.sub(feather), radius.add(feather), distance).oneMinus();
        ink.assign(max(ink, printed.mul(shape).mul(survival)));
      }
    const inside = min(pixel.x.sub(margin.x), pixel.y.sub(margin.y))
        .greaterThanEqual(0)
        .and(
          min(
            resolution.x.sub(margin.x).sub(pixel.x),
            resolution.y.sub(margin.y).sub(pixel.y),
          ).greaterThanEqual(0),
        )
        .select(1, 0),
      band = sin(pixel.y.div(u.feedPitch!).mul(Math.PI * 2))
        .mul(0.5)
        .add(0.5),
      streak = pow(
        noise2d(vec2(floor(pixel.x.div(u.streakWidth!)), 911), controls.randomSeedUint),
        8,
      );
    return ink
      .mul(inside)
      .mul(float(1).sub(band.mul(u.feedBanding!)))
      .mul(float(1).sub(streak.mul(u.streaks!)))
      .mul(u.inkOpacity!);
  })();
}

import type { Node } from "three/webgpu";
import {
  clamp,
  dot,
  exp,
  float,
  floor,
  fract,
  min,
  mix,
  pow,
  smoothstep,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { noise2d, type NoiseSeed } from "../shared/noise";

/** Smooth original seeded wash field, with four bounded integer-hash samples. */
export function cyanotypeWash(position: Node<"vec2">, seed: NoiseSeed) {
  const cell = floor(position),
    f = fract(position),
    fade = f.mul(f).mul(float(3).sub(f.mul(2)));
  return mix(
    mix(noise2d(cell, seed), noise2d(cell.add(vec2(1, 0)), seed), fade.x),
    mix(noise2d(cell.add(vec2(0, 1)), seed), noise2d(cell.add(1), seed), fade.x),
    fade.y,
  );
}

/** Continuous-tone Prussian-blue photographic print, with preserved source coverage. */
export function cyanotypeNode({ source, controls }: EffectNodeContext) {
  const p = controls.parameters,
    position = uv(),
    original = sampleEffect(source, controls, position);
  const pixel = vec2(position.x, position.y.oneMinus()).mul(controls.logicalResolution);
  const luminance = dot(original.rgb, vec3(0.2126, 0.7152, 0.0722)).mul(pow(2, p.exposure!));
  const normalized = luminance.sub(p.blackPoint!).div(p.whitePoint!.sub(p.blackPoint!));
  const corrected = pow(
    clamp(normalized.sub(0.5).mul(p.contrast!).add(0.5), 0, 1),
    float(1).div(p.gamma!),
  );
  const tone = mix(corrected, corrected.oneMinus(), p.invert!);
  const ink = tone.oneMinus();
  // Normalize the optical-density curve so input black and white remain endpoints.
  const density = float(1)
    .sub(exp(ink.mul(p.density!).mul(-2)))
    .div(float(1).sub(exp(p.density!.mul(-2))));
  const field = cyanotypeWash(pixel.div(p.textureScale!), controls.randomSeedUint);
  const grain = noise2d(floor(pixel.div(p.grainScale!)), controls.randomSeedUint).sub(0.5);
  const fiber = noise2d(
    floor(pixel.div(vec2(p.fiberScale!, p.fiberScale!.mul(12)))).add(vec2(37, 101)),
    controls.randomSeedUint,
  ).sub(0.5);
  const edge = min(
    min(pixel.x, pixel.y),
    min(controls.logicalResolution.x.sub(pixel.x), controls.logicalResolution.y.sub(pixel.y)),
  );
  const fading = mix(1, smoothstep(0, p.edgeWidth!, edge), p.edgeFade!);
  const coverage = clamp(
    density
      .mul(float(1).sub(p.wash!.mul(0.5)))
      .mul(float(1).add(field.sub(0.5).mul(p.unevenness!).mul(2)))
      .mul(fading),
    0,
    1,
  );
  const paper = clamp(
    controls.colors.paperColor!.add(vec3(grain.mul(p.paperGrain!).add(fiber.mul(p.fibers!)))),
    0,
    1,
  );
  const result = mix(paper, controls.colors.inkColor!, coverage);
  return vec4(mix(original.rgb, result, controls.amount), original.a);
}

import type { Node } from "three/webgpu";
import {
  Fn,
  abs,
  clamp,
  cos,
  dot,
  exp2,
  float,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  mod,
  pow,
  sin,
  smoothstep,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { mixEffectCoverage } from "../shared/compositing/node";
import { noise2d } from "../shared/noise";
import { crtPhosphors } from "./phosphors";

/** Fixed image-based CRT graph; no framebuffer history, hidden clock or CPU pixels. */
export function crtNode({ source, controls }: EffectNodeContext) {
  const u = controls.parameters,
    colors = controls.colors,
    original = sampleEffect(source, controls, uv());
  const processed = Fn(() => {
    const resolution = controls.logicalResolution,
      position = vec2(uv().x, uv().y.oneMinus()).toVar(),
      pixel = position.mul(resolution).toVar(),
      centered = position.mul(2).sub(1).toVar(),
      frame = mod(floor(controls.time.mul(60)), 65536).toVar(),
      line = floor(pixel.y.div(max(1, u.scanlinePitch!))).toVar(),
      lineNoise = noise2d(vec2(line, frame), controls.randomSeedUint).sub(0.5),
      distorted = centered
        .mul(
          vec2(
            float(1).add(centered.y.mul(centered.y).mul(u.curvatureX!)),
            float(1).add(centered.x.mul(centered.x).mul(u.curvatureY!)),
          ),
        )
        .div(u.zoom!)
        .mul(0.5)
        .add(0.5)
        .toVar(),
      imagePosition = distorted.add(vec2(lineNoise.mul(u.jitter!).div(resolution.x), 0)).toVar(),
      halfTexel = vec2(0.5).div(controls.resolution);
    const read = (coord: Node<"vec2">) => {
      const safe = clamp(coord, halfTexel, halfTexel.oneMinus());
      return sampleEffect(source, controls, vec2(safe.x, safe.y.oneMinus()));
    };
    const center = read(imagePosition),
      reliable = (value: Node<"vec4">) =>
        mix(original.rgb, value.rgb, smoothstep(0, 0.001, value.a)),
      offset = vec2(u.convergence!, 0).div(resolution),
      red = read(imagePosition.add(offset)),
      blue = read(imagePosition.sub(offset)),
      image = vec3(reliable(red).r, reliable(center).g, reliable(blue).b),
      dx = vec2(u.glowRadius!, 0).div(resolution),
      dy = vec2(0, u.glowRadius!).div(resolution);
    const weighted = (value: Node<"vec4">) => vec4(value.rgb.mul(value.a), value.a);
    const blur = weighted(center)
      .mul(0.5)
      .add(
        weighted(read(imagePosition.add(dx)))
          .add(weighted(read(imagePosition.sub(dx))))
          .add(weighted(read(imagePosition.add(dy))))
          .add(weighted(read(imagePosition.sub(dy))))
          .mul(0.125),
      );
    const glow = blur.rgb.div(max(blur.a, 0.00001)).mul(smoothstep(0, 0.001, blur.a)),
      luminance = dot(image, vec3(0.2126, 0.7152, 0.0722)),
      saturated = mix(vec3(luminance), image, u.saturation!),
      contrasted = saturated.sub(0.5).mul(u.contrast!).add(0.5),
      phase = fract(pixel.y.div(u.scanlinePitch!).add(u.scanlinePhase!)).sub(0.5),
      beam = exp2(phase.mul(phase).mul(-4).div(pow(u.scanlineWidth!, 2))),
      scanline = mix(1, beam, u.scanlineStrength!),
      mask = mix(
        vec3(1),
        crtPhosphors(pixel, controls.scale, u.maskGap!, u.mask!),
        u.maskStrength!,
      ),
      vignette = float(1).sub(min(1, pow(length(centered).mul(0.65), 2)).mul(u.vignette!)),
      flicker = float(1).add(
        sin(fract(controls.time.mul(u.flickerRate!)).mul(Math.PI * 2)).mul(u.flicker!),
      ),
      bar = pow(
        cos(position.y.sub(fract(controls.time.mul(u.rollingSpeed!))).mul(Math.PI * 2))
          .mul(0.5)
          .add(0.5),
        12,
      ),
      rolling = float(1).sub(bar.mul(u.rollingBar!)),
      noise = noise2d(floor(pixel).add(vec2(frame, frame.mul(17))), controls.randomSeedUint)
        .sub(0.5)
        .mul(u.noise!),
      lit = contrasted
        .add(glow.mul(u.glow!))
        .mul(mask)
        .mul(scanline)
        .mul(u.brightness!)
        .mul(vignette)
        .mul(flicker)
        .mul(rolling)
        .mul(colors.tintColor!)
        .add(noise),
      radius = min(resolution.x, resolution.y).mul(u.roundness!),
      q = abs(distorted.sub(0.5)).mul(resolution).sub(resolution.mul(0.5).sub(radius)),
      distance = length(max(q, 0))
        .add(min(max(q.x, q.y), 0))
        .sub(radius),
      screen = smoothstep(
        u.borderSoftness!.mul(-0.5),
        u.borderSoftness!.mul(0.5),
        distance,
      ).oneMinus(),
      bezel = vec4(colors.bezelColor!, original.a.mul(u.cutout!.oneMinus())),
      emitted = vec4(clamp(lit, 0, 1), original.a);
    return mixEffectCoverage(bezel, emitted, screen);
  })();
  return mixEffectCoverage(original, processed, controls.amount);
}

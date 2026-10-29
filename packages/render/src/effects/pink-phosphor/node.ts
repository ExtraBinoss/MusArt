import {
  Fn,
  If,
  clamp,
  exp2,
  float,
  floor,
  fract,
  max,
  mix,
  mod,
  pow,
  sin,
  uint,
  uv,
  vec2,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { noise2d } from "../shared/noise";
import { phosphorGlow, phosphorPalette, phosphorTone } from "./emission";

/** Explicit document phase drives flicker/grain; no wall clock, feedback buffer or afterglow state. */
export function pinkPhosphorNode(context: EffectNodeContext) {
  const { source, controls } = context,
    u = controls.parameters,
    original = sampleEffect(source, controls, uv());
  const processed = Fn(() => {
    const position = uv().toVar(),
      pixel = vec2(position.x, position.y.oneMinus()).mul(controls.logicalResolution).toVar(),
      phase = controls.time.mul(u.speed!).toVar(),
      tone = phosphorTone(original.rgb, controls).toVar(),
      color = phosphorPalette(tone, controls).toVar(),
      glow = float(0).toVar();
    If(u.glow!.greaterThan(0), () => glow.assign(phosphorGlow(position, context)));
    const line = fract(pixel.y.div(max(2, controls.scale))).sub(0.5),
      beam = exp2(line.mul(line).mul(-4).div(pow(u.beamWidth!, 2))),
      scanlines = mix(1, beam, u.scanlines!),
      flicker = sin(fract(phase).mul(Math.PI * 2))
        .mul(u.flicker!)
        .add(1),
      grain = noise2d(
        floor(pixel),
        controls.randomSeedUint.add(uint(floor(mod(phase.mul(30), 65536)))),
      ).sub(0.5);
    return clamp(
      color
        .add(controls.colors.phosphor!.mul(glow).mul(u.glow!))
        .mul(scanlines)
        .mul(flicker)
        .add(grain.mul(u.grain!)),
      0,
      1,
    );
  })();
  return vec4(mix(original.rgb, processed, controls.amount), original.a);
}

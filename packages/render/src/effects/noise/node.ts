import { Fn, If, clamp, float, max, mix, pow, uint, uv, vec2, vec3, vec4 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { noiseField } from "./fields";

/** True 3D noise is evaluated in authored coordinates; raster density never reseeds it. */
export function noiseNode({ source, controls }: EffectNodeContext) {
  const u = controls.parameters,
    position = uv(),
    original = sampleEffect(source, controls, position),
    seed = uint(controls.randomSeedUint),
    phase = vec3(
      float(seed.bitAnd(uint(1023))),
      float(seed.shiftRight(uint(10)).bitAnd(uint(1023))),
      float(seed.shiftRight(uint(20)).bitAnd(uint(2047))),
    ).mul(0.125),
    pixel = vec2(position.x, position.y.oneMinus())
      .mul(controls.logicalResolution)
      .add(vec2(u.offsetX!, u.offsetY!)),
    authoredPoint = vec3(
      pixel.div(max(1, controls.scale)),
      u.offsetZ!.add(controls.time.mul(u.speed!)),
    ).add(phase),
    settings = {
      algorithm: u.algorithm!,
      octaves: u.octaves!,
      lacunarity: u.lacunarity!,
      persistence: u.persistence!,
      jitter: u.jitter!,
    };
  const field = Fn(() => {
    // Materialize shared coordinates before any field/color branch. Three can
    // otherwise memoize an expression in the first branch which happens to use it.
    const point = authoredPoint.toVar(),
      mono = noiseField(point, settings),
      result = vec3(mono).toVar();
    If(controls.color.greaterThan(0.5), () => {
      result.assign(
        vec3(
          mono,
          noiseField(point.add(vec3(19.17, 7.31, 23.11)), settings),
          noiseField(point.add(vec3(73.43, 41.29, 11.53)), settings),
        ),
      );
    });
    return result;
  })();
  const adjusted = pow(
      clamp(field.sub(0.5).mul(u.contrast!).add(0.5).add(u.brightness!), 0, 1),
      float(1).div(max(0.1, u.gamma!)),
    ),
    values = mix(adjusted, adjusted.oneMinus(), u.invert!),
    color = mix(controls.colors.lowColor!, controls.colors.highColor!, values);
  const output = Fn(() => {
    const result = color.toVar();
    If(u.mode!.greaterThan(1.5), () => {
      result.assign(original.rgb.mul(color));
    }).ElseIf(u.mode!.greaterThan(0.5), () => {
      result.assign(clamp(original.rgb.add(color.sub(0.5)), 0, 1));
    });
    return result;
  })();
  return vec4(mix(original.rgb, output, controls.amount), original.a);
}

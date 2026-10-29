import {
  clamp,
  cos,
  dot,
  exp,
  floor,
  max,
  min,
  mix,
  pow,
  sin,
  smoothstep,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { noise2d } from "../shared/noise";

/** A smooth elliptical spotlight in authored document coordinates. */
export function flashlightNode({ source, controls }: EffectNodeContext) {
  const p = controls.parameters,
    position = uv(),
    original = sampleEffect(source, controls, position),
    pixel = vec2(position.x, position.y.oneMinus()).mul(controls.logicalResolution),
    center = vec2(p.centerX!, p.centerY!).mul(controls.logicalResolution),
    delta = pixel.sub(center),
    angle = p.rotation!.mul(Math.PI / 180),
    c = cos(angle),
    s = sin(angle),
    rotated = vec2(delta.x.mul(c).add(delta.y.mul(s)), delta.y.mul(c).sub(delta.x.mul(s))),
    distance = vec2(rotated.x.div(max(0.2, p.aspect!)), rotated.y).length(),
    radius = max(
      0.001,
      p.radius!.mul(min(controls.logicalResolution.x, controls.logicalResolution.y)),
    ),
    feather = min(radius, max(0.001, radius.mul(p.softness!))),
    shape = smoothstep(radius.sub(feather), radius, distance).oneMinus(),
    baseBeam = pow(shape, p.falloff!),
    beam = mix(baseBeam, baseBeam.oneMinus(), p.invert!),
    strength = beam.mul(p.intensity!).mul(pow(2, p.exposure!)),
    tint = controls.colors.lightColor!,
    grain = noise2d(floor(pixel.div(p.grainSize!)), controls.randomSeedUint)
      .sub(0.5)
      .mul(p.grain!)
      .mul(beam),
    illuminated = original.rgb
      .mul(p.ambient!)
      .add(original.rgb.mul(tint).mul(strength))
      .add(tint.mul(beam).mul(p.glow!))
      .add(vec3(grain)),
    luma = dot(illuminated, vec3(0.2126, 0.7152, 0.0722)),
    colored = max(vec3(0), mix(vec3(luma), illuminated, p.saturation!)),
    compressed = vec3(1).sub(exp(colored.negate())),
    result = mix(clamp(colored, 0, 1), compressed, p.highlightCompression!);
  return vec4(mix(original.rgb, result, controls.amount), original.a);
}

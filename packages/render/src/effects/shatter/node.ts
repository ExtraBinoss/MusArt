import type { Node } from "three/webgpu";
import {
  Fn,
  If,
  abs,
  clamp,
  cos,
  dot,
  float,
  floor,
  length,
  max,
  min,
  mix,
  normalize,
  pow,
  refract,
  reflect,
  sin,
  smoothstep,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import { mixEffectCoverage } from "../shared/compositing/node";
import { cellularFracture, impactFracture, shatterHash } from "./fracture";

/** Image-based dielectric facets; graph topology remains constant for every control. */
export function shatterNode({ source, controls }: EffectNodeContext) {
  const u = controls.parameters,
    colors = controls.colors,
    original = sampleEffect(source, controls, uv());
  const processed = Fn(() => {
    const position = uv(),
      resolution = controls.logicalResolution,
      // Portable impact coordinates are Y-down; source/plane UVs are Y-up.
      // Materialize shared expressions before either Fn/branch can cache a temporary.
      pixel = vec2(position.x, position.y.oneMinus()).mul(resolution).toVar(),
      center = vec2(u.centerX!, u.centerY!).mul(resolution).toVar(),
      size = max(8, controls.scale).toVar(),
      seed = controls.randomSeedUint;
    const field = vec4(0).toVar();
    If(u.pattern!.lessThan(0.5), () => {
      field.assign(impactFracture(pixel, center, size, u.jitter!, u.spokes!, seed));
    }).Else(() => {
      field.assign(cellularFracture(pixel, size, u.jitter!, seed));
    });
    const hash = field.w,
      second = shatterHash(vec2(floor(hash.mul(65535)), 109), seed),
      tilt = vec2(hash, second).mul(2).sub(1).mul(u.tilt!),
      normal = normalize(vec3(tilt, 1)),
      angle = hash
        .sub(0.5)
        .mul(u.rotation!)
        .mul(Math.PI / 180),
      relative = pixel.sub(field.xy),
      rotated = vec2(
        cos(angle).mul(relative.x).sub(sin(angle).mul(relative.y)),
        sin(angle).mul(relative.x).add(cos(angle).mul(relative.y)),
      ),
      base = field.xy.add(rotated).add(tilt.mul(u.displacement!)),
      incident = vec3(0, 0, -1),
      halfTexel = vec2(0.5).div(controls.resolution);
    const transmitted = (ior: Node<"float">) => {
      const ray = refract(incident, normal, float(1).div(max(1, ior)));
      const coord = base.add(ray.xy.div(max(abs(ray.z), 0.05)).mul(u.thickness!)).div(resolution);
      return vec2(coord.x, coord.y.oneMinus());
    };
    const read = (coord: Node<"vec2">) =>
      sampleEffect(source, controls, clamp(coord, halfTexel, halfTexel.oneMinus()));
    const coord = transmitted(u.ior!),
      middle = read(coord),
      dispersion = u.dispersion!.mul(0.12),
      red = read(transmitted(u.ior!.sub(dispersion))),
      blue = read(transmitted(u.ior!.add(dispersion))),
      reliable = (sample: Node<"vec4">) =>
        mix(original.rgb, sample.rgb, smoothstep(0, 0.001, sample.a)),
      chromatic = vec3(reliable(red).r, reliable(middle).g, reliable(blue).b),
      radius = u.roughness!.mul(size).mul(0.25),
      dx = vec2(radius, 0).div(resolution),
      dy = vec2(0, radius).div(resolution);
    // Blur in premultiplied space; never average hidden transparent RGB into the image.
    const weighted = (sample: Node<"vec4">) => vec4(sample.rgb.mul(sample.a), sample.a);
    const blurred = weighted(middle)
      .mul(0.5)
      .add(
        weighted(read(coord.add(dx)))
          .add(weighted(read(coord.sub(dx))))
          .add(weighted(read(coord.add(dy))))
          .add(weighted(read(coord.sub(dy))))
          .mul(0.125),
      );
    const blurredRgb = mix(
        original.rgb,
        blurred.rgb.div(max(blurred.a, 0.00001)),
        smoothstep(0, 0.001, blurred.a),
      ),
      image = mix(chromatic, blurredRgb, u.roughness!),
      tinted = mix(image, image.mul(colors.tintColor!), u.tintStrength!),
      light = normalize(vec3(-0.45, -0.65, 1)),
      specular = pow(max(0, dot(reflect(incident, normal), light)), mix(96, 8, u.roughness!)),
      fresnel = pow(u.ior!.sub(1).div(u.ior!.add(1)), 2),
      edgeLight = pow(max(0, float(1).sub(field.z.div(max(1, u.crackWidth!.mul(3))))), 3),
      highlighted = tinted.add(
        colors
          .highlightColor!.mul(specular.mul(fresnel).mul(2).add(edgeLight.mul(0.35)))
          .mul(u.highlights!),
      ),
      crack = smoothstep(u.crackWidth!.mul(0.5), u.crackWidth!.mul(0.5).add(1), field.z)
        .oneMinus()
        .mul(min(1, u.crackWidth!)),
      fractured = mix(highlighted, colors.crackColor!, crack.mul(u.cracks!));
    const distance = length(pixel.sub(center)).div(min(resolution.x, resolution.y)),
      outer = max(0.05, u.radius!),
      inner = min(u.innerRadius!, outer.mul(0.95)),
      falloff = pow(smoothstep(outer.mul(0.65), outer, distance).oneMinus(), u.falloff!),
      protectedCenter = inner
        .greaterThan(0)
        .select(smoothstep(inner, inner.add(outer.mul(0.05)), distance), 1),
      amount = falloff.mul(protectedCenter),
      alpha = original.a.mul(float(1).sub(crack.mul(u.cutout!)));
    return mixEffectCoverage(original, vec4(clamp(fractured, 0, 1), alpha), amount);
  })();
  return mixEffectCoverage(original, processed, controls.amount);
}

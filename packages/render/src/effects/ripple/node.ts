import {
  clamp,
  fract,
  length,
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

/** A deterministic document-space wave; presentation density never enters its field. */
export function rippleNode({ source, controls }: EffectNodeContext) {
  const u = controls.parameters;
  const position = uv();
  const original = sampleEffect(source, controls, position);
  const size = controls.logicalResolution;
  // Portable centers use document coordinates (Y down); plane UVs have Y up.
  const delta = vec2(position.x, position.y.oneMinus()).sub(vec2(u.centerX!, u.centerY!)).mul(size);
  const distance = length(delta);
  const radius = max(1, u.radius!);
  const inner = min(u.innerRadius!, radius);
  const span = max(0.01, radius.sub(inner));
  // At the largest legal radius, 0.01px remains representable in float32.
  const feather = min(max(0.01, u.feather!), max(0.01, span.mul(0.5)));
  const envelope = smoothstep(inner, inner.add(feather), distance)
    .mul(smoothstep(radius.sub(feather), radius, distance).oneMinus())
    .mul(pow(clamp(radius.sub(distance).div(span), 0.0001, 1), u.falloff!));
  const direction = mix(1, -1, u.direction!);
  const wavelength = max(2, u.wavelength!);
  // Reduce independently: subtracting a 44M-cycle clock from the spatial
  // phase first would erase its fractional wave in the float32 shader.
  const spatialPhase = fract(distance.sub(inner).div(wavelength));
  const temporalPhase = fract(controls.time.mul(u.speed!).div(wavelength));
  const phase = fract(spatialPhase.sub(temporalPhase.mul(direction)).add(u.phase!.div(360))).mul(
    2 * Math.PI,
  );
  const displacement = delta
    .div(max(distance, 0.0001))
    .mul(sin(phase))
    .mul(u.amplitude!)
    .mul(envelope)
    .div(size);
  const offset = vec2(displacement.x, displacement.y.negate());
  const coord = position.add(offset);
  const refracted = sampleEffect(source, controls, coord);
  const split = offset.mul(u.dispersion!).mul(0.25);
  const color = vec3(
    sampleEffect(source, controls, coord.add(split)).r,
    refracted.g,
    sampleEffect(source, controls, coord.sub(split)).b,
  );
  // Alpha is an independent coverage contract: distortion never expands the layer silhouette.
  return vec4(mix(original.rgb, color, controls.amount), original.a);
}

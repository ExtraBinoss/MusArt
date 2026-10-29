import type { Node } from "three/webgpu";
import {
  Fn,
  abs,
  exp,
  float,
  floor,
  fract,
  max,
  min,
  mix,
  smoothstep,
  sqrt,
  uint,
  vec2,
  vec3,
} from "three/tsl";
import type { EffectUniforms } from "../shared/uniforms";
import { noise2d } from "../shared/noise";

/** Coverage and paper lighting in authored Y-down pixels; no generated paper bitmap. */
export function receiptPaper(pixel: Node<"vec2">, controls: EffectUniforms) {
  const u = controls.parameters;
  return Fn(() => {
    const pitch = u.edgePitch!,
      height = u.edgeHeight!,
      cell = floor(pixel.x.div(pitch)).toVar(),
      phase = fract(pixel.x.div(pitch)).toVar(),
      topNoise = noise2d(vec2(cell, 71), controls.randomSeedUint).toVar(),
      bottomNoise = noise2d(vec2(cell, 509), controls.randomSeedUint).toVar(),
      triangle = abs(phase.sub(0.5)).mul(2).toVar(),
      topTear = mix(triangle, topNoise, u.edgeJitter!).mul(height).toVar(),
      bottomTear = mix(triangle.oneMinus(), bottomNoise, u.edgeJitter!).mul(height).toVar(),
      scallop = sqrt(max(0, float(1).sub(phase.sub(0.5).mul(2).pow(2))))
        .mul(height)
        .toVar(),
      topOffset = u
        .edge!.lessThan(0.5)
        .select(0, u.edge!.lessThan(1.5).select(topTear, scallop))
        .toVar(),
      bottomOffset = u
        .edge!.lessThan(0.5)
        .select(0, u.edge!.lessThan(1.5).select(bottomTear, scallop))
        .toVar(),
      distance = min(
        pixel.y.sub(topOffset),
        controls.logicalResolution.y.sub(pixel.y).sub(bottomOffset),
      ).toVar(),
      coverage = smoothstep(u.edgeSoftness!.mul(-0.5), u.edgeSoftness!.mul(0.5), distance).toVar(),
      edgeLight = float(1).sub(exp(abs(distance).negate().div(1.5)).mul(u.edgeShade!)),
      fold = pixel.y.sub(controls.logicalResolution.y.mul(u.foldPosition!)).div(u.foldWidth!),
      folded = float(1).add(
        fold
          .mul(exp(abs(fold).negate()))
          .mul(Math.E)
          .mul(u.foldStrength!),
      ),
      fibers = noise2d(
        floor(pixel.div(vec2(u.fiberSize!.mul(0.3), u.fiberSize!.mul(2)))),
        controls.randomSeedUint,
      ),
      grain = noise2d(floor(pixel), controls.randomSeedUint.add(uint(617))),
      texture = fibers.mul(0.7).add(grain.mul(0.3)).sub(0.5).mul(u.paperTexture!);
    return vec3(coverage, folded.mul(edgeLight), texture);
  })();
}

// MIT: ExtraBinoss / Plinka (2026), React-Beautiful-Gradient glass pass.
import type { Node } from "three/webgpu";
import { abs, clamp, floor, fract, max, mix, pow, sin, uv, vec2, vec3, vec4 } from "three/tsl";
import type { EffectNodeContext } from "../../../shared/context";
import { rotate } from "../../shared/field";
import { gradientHash } from "../../shared/noise";
import { premultiply, readGradient, treatmentControls, unpremultiply } from "../shared";
export function glassNode(context: EffectNodeContext) {
  const u = treatmentControls(context),
    resolution = context.controls.logicalResolution,
    size = max(2, u.size);
  const px = uv().mul(resolution),
    angle = u.treatmentRotation.mul(Math.PI / 180);
  const p = rotate(px.sub(resolution.mul(0.5)), angle),
    direction = rotate(vec2(1, 0), angle.negate());
  const normal = sin(fract(p.x.div(size).add(0.5)).sub(0.5).mul(Math.PI));
  const coord = uv().add(
    direction.mul(normal).mul(size).mul(u.refraction).mul(0.28).div(resolution),
  );
  const radius = u.blur.mul(size).mul(0.18),
    dx = vec2(radius, 0).div(resolution),
    dy = vec2(0, radius).div(resolution);
  const color = unpremultiply(
    premultiply(readGradient(context, coord))
      .mul(0.4)
      .add(
        premultiply(readGradient(context, coord.add(dx)))
          .add(premultiply(readGradient(context, coord.sub(dx))))
          .add(premultiply(readGradient(context, coord.add(dy))))
          .add(premultiply(readGradient(context, coord.sub(dy))))
          .mul(0.15),
      ),
  );
  const split = direction.mul(normal).mul(size).mul(u.dispersion).mul(0.035).div(resolution);
  let rgb: Node<"vec3"> = vec3(
    readGradient(context, coord.add(split)).r,
    color.g,
    readGradient(context, coord.sub(split)).b,
  );
  const shine = pow(max(0, normal.mul(normal).oneMinus()), 12),
    edge = pow(abs(normal), 14);
  rgb = rgb.add(shine.mul(0.1).add(edge.mul(0.2)).mul(u.highlight));
  rgb = mix(rgb, vec3(1), u.frost.mul(0.08)).add(
    gradientHash(floor(px)).sub(0.5).mul(u.frost).mul(0.14),
  );
  return vec4(clamp(rgb, 0, 1), color.a);
}

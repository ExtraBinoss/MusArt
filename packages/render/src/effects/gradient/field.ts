// TSL port of MIT React-Beautiful-Gradient, ExtraBinoss / Plinka (2026).
import { GRADIENT_STYLES, type GradientStyle } from "@musart/core";
import { Fn, If, clamp, dot, hue, max, min, mix, uv, vec3, vec4 } from "three/tsl";
import type { EffectNodeContext } from "../shared/context";
import { fieldContext, type GradientField } from "./shared/field";
import type { GradientUniforms } from "./shared/uniforms";
import { meshField } from "./variants/mesh/node";
import { silkField } from "./variants/silk/node";
import { auroraField } from "./variants/aurora/node";
import { liquidField } from "./variants/liquid/node";
import { radialField } from "./variants/radial/node";
import { wavesField } from "./variants/waves/node";
import { stripesField } from "./variants/stripes/node";
export const GRADIENT_FIELDS: Readonly<Record<GradientStyle, GradientField>> = Object.freeze({
  mesh: meshField,
  silk: silkField,
  aurora: auroraField,
  liquid: liquidField,
  radial: radialField,
  waves: wavesField,
  stripes: stripesField,
});
export function gradientColor(position: ReturnType<typeof uv>, u: GradientUniforms) {
  return Fn(() => {
    const raw = fieldContext(position, u);
    // Shared domain temporaries must be emitted outside style branches. Otherwise
    // Three can cache a temporary initialized only in the first consuming branch.
    const context = {
      ...raw,
      domain: raw.domain.toVar(),
      wave: raw.wave.toVar(),
      phase: raw.phase.toVar(),
    };
    const color = vec3(0).toVar();
    GRADIENT_STYLES.forEach((style, index) =>
      If(u.style.equal(index), () => {
        const field = GRADIENT_FIELDS[style](context);
        const light = max(field.height, 0)
          .mul(u.highlights)
          .mul(0.12)
          .add(1)
          .sub(min(field.height.negate().max(0), 1).mul(u.shadows).mul(0.12));
        color.assign(field.color.mul(light));
      }),
    );
    const saturated = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, u.saturation).mul(
      u.brightness,
    );
    return clamp(
      hue(saturated, u.hue.mul(Math.PI / 180))
        .sub(0.5)
        .mul(u.contrast)
        .add(0.5),
      0,
      1,
    );
  })();
}
export function gradientFieldNode({ controls }: EffectNodeContext) {
  if (!controls.gradient) throw new Error("Gradient uniforms are missing.");
  return vec4(gradientColor(uv(), controls.gradient), 1);
}

// MIT: ExtraBinoss / Plinka (2026), React-Beautiful-Gradient radial field.
import { cos, float, length, sin, vec2 } from "three/tsl";
import { normalizedPalette, type GradientField } from "../../shared/field";
export const radialField: GradientField = ({ controls: u, domain: d, phase }) => {
  const orbit = d.sub(vec2(sin(phase), cos(phase)).mul(0.15));
  const rings = length(orbit).mul(u.frequencyX.add(2)).add(sin(phase).mul(u.amplitude).mul(0.25));
  return {
    color: normalizedPalette(cos(rings.mul(Math.PI)).mul(0.5).add(0.5), u),
    height: float(0),
  };
};

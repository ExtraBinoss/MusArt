// MIT: ExtraBinoss / Plinka (2026), React-Beautiful-Gradient silk field.
import { cos, pow, sin } from "three/tsl";
import { normalizedPalette, type GradientField } from "../../shared/field";
export const silkField: GradientField = ({ controls: u, domain: d, phase }) => {
  const folds = d.y
    .mul(u.frequencyY.add(2))
    .add(sin(d.x.mul(3).add(phase)).mul(u.amplitude).mul(0.2));
  const silk = sin(folds.mul(Math.PI).add(cos(d.x.mul(u.frequencyX).add(phase))))
    .mul(0.5)
    .add(0.5);
  return {
    color: normalizedPalette(silk, u),
    height: pow(
      cos(folds.mul(Math.PI * 2))
        .mul(0.5)
        .add(0.5),
      3,
    )
      .mul(u.amplitude)
      .mul(0.1),
  };
};

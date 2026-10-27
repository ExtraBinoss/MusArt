// MIT: ExtraBinoss / Plinka (2026), React-Beautiful-Gradient waves field.
import { float, sin } from "three/tsl";
import { normalizedPalette, type GradientField } from "../../shared/field";
export const wavesField: GradientField = ({ controls: u, domain: d, phase }) => {
  const ridge = d.y.mul(u.frequencyY.add(1)).add(
    sin(d.x.mul(u.frequencyX.add(2)).add(phase))
      .mul(u.amplitude)
      .mul(0.12),
  );
  return {
    color: normalizedPalette(sin(ridge.mul(Math.PI)).mul(0.5).add(0.5), u),
    height: float(0),
  };
};

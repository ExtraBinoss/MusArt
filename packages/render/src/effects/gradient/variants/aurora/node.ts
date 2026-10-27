// MIT: ExtraBinoss / Plinka (2026), React-Beautiful-Gradient aurora field.
import { exp, float, mix, sin } from "three/tsl";
import { normalizedPalette, type GradientField } from "../../shared/field";
export const auroraField: GradientField = ({ controls: u, domain: d, phase }) => {
  const curtain = sin(
    d.x
      .mul(u.frequencyX.mul(2).add(3))
      .add(sin(d.y.mul(4).add(phase)).mul(u.flow))
      .add(phase),
  );
  const offset = d.y.add(curtain.mul(0.22)).mul(2.5);
  const glow = exp(offset.mul(offset).negate());
  return {
    color: mix(u.colors[0]!.mul(0.35), normalizedPalette(curtain.mul(0.5).add(0.5), u), glow),
    height: float(0),
  };
};

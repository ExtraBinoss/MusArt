// MIT: ExtraBinoss / Plinka (2026), React-Beautiful-Gradient liquid field.
import { cos, float, sin, vec2 } from "three/tsl";
import { normalizedPalette, type GradientField } from "../../shared/field";
export const liquidField: GradientField = ({ controls: u, domain: d, phase }) => {
  const fluid = d.add(
    vec2(sin(d.y.mul(5).add(phase)), cos(d.x.mul(4).sub(phase)))
      .mul(u.flow)
      .mul(0.35),
  );
  const pools = sin(
    fluid.x.mul(u.frequencyX.add(2)).add(
      sin(fluid.y.mul(u.frequencyY.add(2)).add(phase))
        .mul(u.amplitude)
        .mul(0.25),
    ),
  );
  return { color: normalizedPalette(pools.mul(0.5).add(0.5), u), height: float(0) };
};

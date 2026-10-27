// MIT: ExtraBinoss / Plinka (2026), React-Beautiful-Gradient mesh field.
import { Fn, If, clamp, cos, exp, float, max, pow, sin, smoothstep, vec2, vec3 } from "three/tsl";
import type { GradientField } from "../../shared/field";
export const meshField: GradientField = ({ controls: u, domain: d, phase, wave }) => ({
  color: Fn(() => {
    const sum = vec3(0).toVar(),
      mass = float(0).toVar();
    const sharp = pow(clamp(u.blending.mul(0.1), 0, 1).oneMinus(), 2)
      .mul(24)
      .add(3);
    u.colors.forEach((entry, i) =>
      If(u.colorCount.greaterThan(i), () => {
        const orbit = u.seed.mul(0.013 * 0.11).add(i * 2.399963);
        const radius = float(i * 0.35)
          .div(max(u.colorCount.sub(1), 1))
          .add(0.25);
        const center = vec2(
          cos(orbit.add(sin(phase.add(i)).mul(0.6))),
          sin(orbit.add(cos(phase.add(i * 0.8)).mul(0.5))),
        ).mul(radius);
        const delta = d.sub(center),
          influence = u[`influence${i}` as "influence0"];
        const weight = exp(delta.dot(delta).mul(sharp).negate().div(max(influence, 0.05))).mul(
          smoothstep(0, 0.08, influence),
        );
        sum.addAssign(entry.mul(weight));
        mass.addAssign(weight);
      }),
    );
    return sum.div(max(mass, 0.00001));
  })(),
  height: wave.x.add(wave.y).mul(u.amplitude).mul(0.055),
});

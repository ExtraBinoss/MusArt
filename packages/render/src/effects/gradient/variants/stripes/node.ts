// MIT: ExtraBinoss / Plinka (2026), original EasyDocs onboarding stripes port.
import { clamp, float, length, mix, pow, sin, smoothstep, vec2 } from "three/tsl";
import { rotate, type GradientField } from "../../shared/field";
import { stripesNoise } from "../../shared/noise";
export const stripesField: GradientField = ({ controls: u, position, phase }) => {
  const t = sin(phase)
    .mul(u.duration)
    .div(Math.PI * 2)
    .add(6);
  const p = rotate(
    position
      .sub(0.5)
      .sub(vec2(u.centerX, u.centerY).mul(0.5))
      .mul(u.scale)
      .mul(vec2(u.stretch, u.stretch.reciprocal())),
    u.seed.mul(0.12).add(u.rotation.mul(Math.PI / 180)),
  ).add(0.5);
  const mist = stripesNoise(p.mul(vec2(2.5, 1.5)).add(vec2(t.mul(0.023), t.mul(-0.016))));
  const eddy = stripesNoise(
    p
      .mul(vec2(1.6, 2.1))
      .add(vec2(t.mul(-0.013), t.mul(0.017)))
      .add(u.seed.mul(0.18)),
  );
  const bend = sin(p.y.mul(u.frequencyY.add(1.1)).add(t.mul(0.11)).add(u.seed).add(eddy.mul(0.28)))
    .mul(0.52)
    .mul(u.amplitude.div(3.5))
    .add(eddy.sub(0.5).mul(0.32))
    .add(mist.sub(0.5).mul(0.85));
  const x = p.x
    .mul(u.frequencyX.add(1))
    .add(bend)
    .add(mist.sub(0.5).mul(eddy.sub(0.5)).mul(0.8));
  const wave = sin(x.mul(3.55).add(eddy.sub(0.5).mul(0.65)).sub(t.mul(0.105)).add(u.seed.mul(0.4)))
    .mul(0.5)
    .add(0.5);
  const fold = smoothstep(0.12, 0.95, wave),
    glow = pow(smoothstep(0.52, 1, wave), 1.8);
  const depth = sin(p.y.mul(3.2).add(x.mul(0.4)).add(t.mul(0.075)))
    .mul(0.5)
    .add(0.5);
  let color = mix(
    u.colors[0]!,
    u.colors[1]!,
    fold.mul(0.76).add(0.24).mul(mist.mul(0.15).add(0.85)),
  );
  color = mix(color, u.colors[2]!, glow.mul(depth.mul(0.5).add(0.26)));
  const ribbon = pow(
    smoothstep(
      mist.mul(0.08).add(0.62),
      1,
      sin(x.mul(3.55).add(1.38).sub(t.mul(0.105)))
        .mul(0.5)
        .add(0.5),
    ),
    1.5,
  );
  color = mix(color, u.colors[3]!, ribbon.mul(mix(depth, eddy, 0.4).mul(0.67).add(0.22)));
  color = color.mul(
    pow(length(position.sub(0.5).mul(vec2(1, 0.65))), 1.3)
      .mul(0.07)
      .oneMinus(),
  );
  // Static position grain is applied in the finishing pass, in document pixels, independent of raster density.
  return { color: clamp(color, 0, 1), height: float(0) };
};

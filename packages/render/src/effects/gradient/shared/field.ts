// MIT: ExtraBinoss / Plinka, React-Beautiful-Gradient (2026). See docs/legal/plinka-gradient-MIT.txt.
import type { Node } from "three/webgpu";
import { Fn, If, abs, clamp, cos, float, max, min, mod, pow, sin, vec2, vec3 } from "three/tsl";
import type { GradientUniforms } from "./uniforms";
export interface GradientFieldContext {
  readonly controls: GradientUniforms;
  readonly position: Node<"vec2">;
  readonly domain: Node<"vec2">;
  readonly wave: Node<"vec2">;
  readonly phase: Node<"float">;
}
export type GradientField = (context: GradientFieldContext) => {
  color: Node<"vec3">;
  height: Node<"float">;
};
/** GLSL mat2(c,-s,s,c) uses column-major storage. */
export function rotate(position: Node<"vec2">, angle: Node<"float">) {
  const c = cos(angle),
    s = sin(angle);
  return vec2(c.mul(position.x).add(s.mul(position.y)), c.mul(position.y).sub(s.mul(position.x)));
}
/** Upstream finishing time freezes with speed zero and repeats at the loop boundary. */
export function gradientPhase(u: GradientUniforms) {
  return u.speed.greaterThan(0).select(
    mod(u.time, u.duration)
      .div(u.duration)
      .mul(Math.PI * 2),
    0,
  );
}
export function fieldContext(position: Node<"vec2">, u: GradientUniforms): GradientFieldContext {
  const phase = gradientPhase(u).mul(u.speed.round());
  const seed = u.seed.mul(0.013);
  const p = rotate(
    position.mul(2).sub(1).sub(vec2(u.centerX, u.centerY)),
    u.rotation.mul(Math.PI / 180).add(seed.mul(0.07)),
  )
    .mul(0.5)
    .mul(u.scale)
    .mul(vec2(u.stretch, u.stretch.reciprocal()));
  const wave = vec2(
    sin(
      p.y
        .mul(u.frequencyY)
        .mul(1.7)
        .add(sin(p.x.mul(2.8).add(phase).add(seed)))
        .add(phase),
    ),
    cos(
      p.x
        .mul(u.frequencyX)
        .mul(1.7)
        .add(cos(p.y.mul(2.4).sub(phase).add(seed)))
        .sub(phase),
    ),
  );
  const d = p.add(wave.mul(u.amplitude).mul(0.065));
  const radius = p.dot(p);
  const twist = u.flow
    .mul(0.7)
    .mul(sin(radius.mul(5).sub(phase)))
    .add(u.twist.mul(radius));
  return {
    controls: u,
    position,
    wave,
    phase,
    domain: rotate(d, twist).mul(vec2(u.pressureX, u.pressureY)).mul(0.34),
  };
}
export function palette(position: Node<"float">, u: GradientUniforms): Node<"vec3"> {
  return Fn(() => {
    const color = vec3(0).toVar(),
      mass = float(0).toVar();
    const at = mod(position, u.colorCount);
    u.colors.forEach((entry, i) => {
      If(u.colorCount.greaterThan(i), () => {
        const distance = min(abs(at.sub(i)), u.colorCount.sub(abs(at.sub(i))));
        const weight = pow(
          max(0, distance.oneMinus()),
          max(0.35, u.blending.mul(0.15).mul(-0.6).add(1.5)),
        ).mul(u[`influence${i}` as "influence0"]);
        color.addAssign(entry.mul(weight));
        mass.addAssign(weight);
      });
    });
    return color.div(max(mass, 0.00001));
  })();
}
export const normalizedPalette = (wave: Node<"float">, u: GradientUniforms) =>
  palette(clamp(wave, 0, 1).mul(u.colorCount.sub(1)), u);

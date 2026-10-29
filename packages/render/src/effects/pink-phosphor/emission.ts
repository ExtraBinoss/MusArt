import type { Node } from "three/webgpu";
import { Fn, clamp, dot, exp2, float, max, mix, pow, smoothstep, vec2, vec3 } from "three/tsl";
import { sampleEffect, type EffectNodeContext } from "../shared/context";
import type { EffectUniforms } from "../shared/uniforms";

/** Artistic luminance transfer in the compositor's encoded working RGB. */
export function phosphorTone(rgb: Node<"vec3">, controls: EffectUniforms) {
  const u = controls.parameters;
  const exposed = clamp(dot(rgb, vec3(0.2126, 0.7152, 0.0722)).mul(exp2(u.exposure!)), 0, 1);
  return clamp(pow(exposed, float(1).div(u.gamma!)).sub(0.5).mul(u.contrast!).add(0.5), 0, 1);
}
export function phosphorPalette(tone: Node<"float">, controls: EffectUniforms) {
  return mix(
    mix(controls.colors.background!, controls.colors.phosphor!, smoothstep(0, 0.7, tone)),
    controls.colors.highlight!,
    smoothstep(0.65, 1, tone),
  );
}
/** Five weighted cross taps approximate local glow; transparent pixels contribute no energy. */
export function phosphorGlow(position: Node<"vec2">, { source, controls }: EffectNodeContext) {
  const u = controls.parameters;
  return Fn(() => {
    const total = float(0).toVar(),
      offset = vec2(u.glowRadius!).div(controls.logicalResolution).toVar();
    for (const [x, y, weight] of [
      [0, 0, 0.4],
      [-1, 0, 0.15],
      [1, 0, 0.15],
      [0, -1, 0.15],
      [0, 1, 0.15],
    ] as const) {
      const sample = sampleEffect(
          source,
          controls,
          clamp(position.add(vec2(x, y).mul(offset)), 0, 1),
        ).toVar(),
        bright = max(phosphorTone(sample.rgb, controls).sub(u.glowThreshold!), 0).div(
          max(float(1).sub(u.glowThreshold!), 0.0001),
        );
      total.addAssign(bright.mul(sample.a).mul(weight));
    }
    return total;
  })();
}

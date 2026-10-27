import type { Effect } from "@musart/core";
import { Vector2 } from "three/webgpu";
import { uniform } from "three/tsl";

export function createEffectUniforms(effect: Effect, width: number, height: number) {
  return {
    amount: uniform(Math.min(1, Math.max(0, effect.amount))),
    scale: uniform(Math.max(1, effect.scale)),
    levels: uniform(Math.max(1, effect.levels - 1)),
    color: uniform(effect.color ? 1 : 0),
    sourceFlipY: uniform(0),
    seed: uniform(new Vector2(effect.seed % 4, Math.floor(effect.seed / 4) % 4)),
    resolution: uniform(new Vector2(width, height)),
  };
}
export type EffectUniforms = ReturnType<typeof createEffectUniforms>;

/** Mutates uniform values, never graph identity, textures or materials. */
export function updateEffectUniforms(
  controls: EffectUniforms,
  effect: Effect,
  width: number,
  height: number,
): void {
  controls.amount.value = Math.min(1, Math.max(0, effect.amount));
  controls.scale.value = Math.max(1, effect.scale);
  controls.levels.value = Math.max(1, effect.levels - 1);
  controls.color.value = effect.color ? 1 : 0;
  controls.seed.value.set(effect.seed % 4, Math.floor(effect.seed / 4) % 4);
  controls.resolution.value.set(width, height);
}

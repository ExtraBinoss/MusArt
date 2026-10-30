import type { Effect, EffectType } from "@musart/core";
import { blurFootprint } from "../blur/footprint";
import { shadowFootprint } from "../shadow/footprint";
interface Outset {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
const footprints: Partial<Record<EffectType, (effect: Effect) => Outset>> = {
  blur: blurFootprint,
  shadow: shadowFootprint,
};
/** Conservatively admit the whole stack once; all intermediate pixels remain on the GPU. */
export function effectFootprint(effects: readonly Effect[]): Outset {
  const result = { left: 0, top: 0, right: 0, bottom: 0 };
  for (const effect of effects) {
    const bounds = effect.enabled ? footprints[effect.type]?.(effect) : undefined;
    if (bounds)
      for (const side of ["left", "top", "right", "bottom"] as const) result[side] += bounds[side];
  }
  return result;
}

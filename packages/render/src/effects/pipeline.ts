import type { Effect } from "@musart/core";
import { gradientStages } from "./gradient/pipeline";
import { transitionStages } from "./transition/pipeline";
import { EFFECT_NODES } from "./registry";
import type { EffectStage } from "./shared/stages";
export type { EffectStage } from "./shared/stages";

/** The same stage resolver owns compile warming, allocation accounting and actual rendering. */
export function effectStages(effect: Effect): readonly EffectStage[] {
  if (effect.type === "gradient") return gradientStages(effect);
  if (effect.type === "transition") return transitionStages(effect);
  if (!Object.hasOwn(EFFECT_NODES, effect.type))
    throw new Error(`Effet GPU inconnu : ${effect.type}`);
  return [{ key: effect.type, builder: EFFECT_NODES[effect.type], final: true }];
}

import { getEffectDefinition, type Effect } from "@musart/core";
import { gradientStages } from "./gradient/pipeline";
import { transitionStages } from "./transition/pipeline";
import { EFFECT_NODES } from "./registry";
import { blurNode, blurVerticalNode } from "./blur/node";
import { shadowHorizontalNode, shadowNode } from "./shadow/node";
import type { EffectStage } from "./shared/stages";
export type { EffectStage } from "./shared/stages";

/** The same stage resolver owns compile warming, allocation accounting and actual rendering. */
export function effectStages(effect: Effect): readonly EffectStage[] {
  if (getEffectDefinition(effect.type).source === "geometry") return [];
  if (effect.type === "gradient") return gradientStages(effect);
  if (effect.type === "transition") return transitionStages(effect);
  if (effect.type === "blur")
    return [
      { key: "blur:x", builder: blurNode, final: false },
      { key: "blur:y", builder: blurVerticalNode, final: true },
    ];
  if (effect.type === "shadow")
    return [
      { key: "shadow:x", builder: shadowHorizontalNode, final: false },
      { key: "shadow:y", builder: shadowNode, final: true },
    ];
  if (!Object.hasOwn(EFFECT_NODES, effect.type))
    throw new Error(`Effet GPU inconnu : ${effect.type}`);
  return [
    {
      key: effect.type,
      builder: EFFECT_NODES[effect.type as keyof typeof EFFECT_NODES],
      final: true,
    },
  ];
}

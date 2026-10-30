import {
  getTransitionDefinition,
  resolveEffectSettings,
  type Effect,
  type TransitionStyle,
} from "@musart/core";
import type { EffectStage } from "../shared/stages";
import { transitionNode } from "./node";
import { TRANSITION_OPERATORS } from "./registry";

const stages = new Map<TransitionStyle, readonly EffectStage[]>(
  Object.entries(TRANSITION_OPERATORS).map(
    ([style, operator]) =>
      [
        style as TransitionStyle,
        Object.freeze([
          Object.freeze({
            key: `transition:${style}`,
            final: true,
            builder: (context) => transitionNode(context, operator),
          } satisfies EffectStage),
        ]),
      ] as const,
  ),
);
export function transitionStages(effect: Effect): readonly EffectStage[] {
  const style = resolveEffectSettings(effect).style;
  const definition = getTransitionDefinition(style);
  if (!definition)
    throw new Error(`Unknown transition operator "${String(style)}" on effect "${effect.id}".`);
  return stages.get(definition.id)!;
}

import { resolveGradientSettings, type Effect, type GradientTreatment } from "@musart/core";
import { asciiNode } from "../ascii/node";
import { ditherNode } from "../dither/node";
import type { EffectNodeBuilder } from "../shared/context";
import { gradientFieldNode } from "./field";
import { gradientFinishNode } from "./finish";
import { blocksNode } from "./treatments/blocks/node";
import { foldsNode } from "./treatments/folds/node";
import { glassNode } from "./treatments/glass/node";
export interface EffectStage {
  readonly key: string;
  readonly builder: EffectNodeBuilder;
  readonly final: boolean;
  readonly treatment?: boolean;
}
const TREATMENTS: Readonly<Record<Exclude<GradientTreatment, "none">, EffectNodeBuilder>> =
  Object.freeze({
    ascii: asciiNode,
    dither: ditherNode,
    blocks: blocksNode,
    glass: glassNode,
    folds: foldsNode,
  });
export function gradientStages(effect: Effect): readonly EffectStage[] {
  const treatment = resolveGradientSettings(effect.settings).treatment;
  return [
    { key: "gradient:field", builder: gradientFieldNode, final: false },
    ...(treatment === "none"
      ? []
      : [
          {
            key: `gradient:${treatment}`,
            builder: TREATMENTS[treatment],
            final: false,
            treatment: true,
          },
        ]),
    { key: "gradient:finish", builder: gradientFinishNode, final: true },
  ];
}

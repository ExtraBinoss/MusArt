import type { EffectNodeBuilder } from "./context";
export interface EffectStage {
  readonly key: string;
  readonly builder: EffectNodeBuilder;
  readonly final: boolean;
  readonly treatment?: boolean;
}

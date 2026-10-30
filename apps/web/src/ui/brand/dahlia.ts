import { BotEngine } from "./engine/engine";
import type { StateId } from "./engine/bot-types";
import { EXPRESSION_BY_ID } from "./engine/expressions";
import { SHAPE_BY_ID } from "./engine/skins";
import { RAYON } from "./engine/repere";
import { brand } from "./config";

export type BrandState = "idle" | "loading" | "preparing";
export const brandStates = {
  idle: "idle",
  loading: "thinking",
  preparing: "orbit",
} as const satisfies Record<BrandState, StateId>;
/** Maskot's genuine Dahlia profile and wide-eyed expression, with its original morph engine. */
export function createDahliaEngine(state: StateId = "idle"): BotEngine {
  const engine = new BotEngine(
    RAYON,
    state,
    SHAPE_BY_ID.get(brand.mascot.shape)!.radii,
    EXPRESSION_BY_ID.get(brand.mascot.expression)!,
  );
  engine.setEyes(brand.mascot.eyes, -1);
  return engine;
}

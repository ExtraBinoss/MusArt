import type { Effect, EffectSettings } from "../document/model";
import { getEffectDefinition } from "./catalog";
import { resolveGradientSettings } from "./gradient/definition";
import type { GradientSettings } from "./gradient/model";

/** Resolve each effect's own defaults without borrowing Gradient's parameter schema. */
export function resolveEffectSettings(effect: Pick<Effect, "type" | "settings">): EffectSettings {
  if (effect.type === "gradient")
    return { ...resolveGradientSettings(effect.settings as Partial<GradientSettings>) };
  const definition = getEffectDefinition(effect.type);
  const defaults = Object.fromEntries(
    definition.parameters
      .filter((parameter) => "scope" in parameter && parameter.scope === "settings")
      .map((parameter) => [parameter.key, "default" in parameter ? parameter.default : undefined]),
  );
  return { ...defaults, ...definition.defaults.settings, ...effect.settings };
}

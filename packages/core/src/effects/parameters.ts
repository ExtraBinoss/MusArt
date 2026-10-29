import type { Effect } from "../document/model";
import { ensure, type EngineErrorCode } from "../errors";
import { getEffectDefinition } from "./catalog";
import type { EffectParameter } from "./definition";
import {
  GRADIENT_DEFAULT_SETTINGS,
  resolveGradientSettings,
  STRIPE_UNUSED_PARAMETERS,
} from "./gradient/definition";
import type { GradientSettingKey } from "./gradient/model";
import { GRADIENT_PRESETS, gradientPresetSettings } from "./gradient/presets";
import { resolveEffectSettings } from "./settings";

export type EffectParameterValue = number | boolean | string;
export function validateEffectParameter(
  parameter: EffectParameter,
  value: unknown,
  code: EngineErrorCode = "INVALID_COMMAND",
): asserts value is EffectParameterValue {
  if (parameter.kind === "number")
    ensure(
      typeof value === "number" &&
        Number.isFinite(value) &&
        value >= parameter.min &&
        value <= parameter.max &&
        (!parameter.integer || Number.isInteger(value)),
      code,
      "Effect parameter is outside its bounds.",
    );
  else if (parameter.kind === "boolean")
    ensure(typeof value === "boolean", code, "Effect parameter must be boolean.");
  else if (parameter.kind === "color")
    ensure(
      typeof value === "string" && /^#[\da-f]{6}$/i.test(value),
      code,
      "Effect colors must be six-digit RGB hex values.",
    );
  else
    ensure(
      typeof value === "string" && parameter.options.some((option) => option.value === value),
      code,
      "Unknown effect parameter choice.",
    );
}
const settingsScoped = (parameter: EffectParameter) =>
  "scope" in parameter && parameter.scope === "settings";
export function getEffectParameter(
  effect: Effect,
  parameter: EffectParameter,
): EffectParameterValue {
  const value: unknown = settingsScoped(parameter)
    ? resolveEffectSettings(effect)[parameter.key]
    : (effect[parameter.key as keyof Effect] ??
      getEffectDefinition(effect.type).defaults[
        parameter.key as keyof Omit<Effect, "id" | "type">
      ]);
  ensure(
    typeof value === "number" || typeof value === "boolean" || typeof value === "string",
    "INVALID_COMMAND",
    "Effect parameter is missing.",
  );
  return value;
}
export function isEffectParameterVisible(effect: Effect, parameter: EffectParameter): boolean {
  if (
    effect.type === "gradient" &&
    settingsScoped(parameter) &&
    resolveGradientSettings(effect.settings).style === "stripes"
  ) {
    if (parameter.kind === "color")
      return ["color0", "color1", "color2", "color3"].includes(parameter.key);
    if (STRIPE_UNUSED_PARAMETERS.includes(parameter.key as GradientSettingKey)) return false;
  }
  if (!("visibleWhen" in parameter) || !parameter.visibleWhen) return true;
  const condition = parameter.visibleWhen;
  return condition.values.includes(String(resolveEffectSettings(effect)[condition.key]));
}
export function patchEffectParameter(
  effect: Effect,
  parameter: EffectParameter,
  value: EffectParameterValue,
): Partial<Effect> {
  const canonical = getEffectDefinition(effect.type).parameters.find(
    (item) => item.key === parameter.key && settingsScoped(item) === settingsScoped(parameter),
  );
  ensure(canonical, "INVALID_COMMAND", "This parameter does not belong to the effect.");
  validateEffectParameter(canonical, value);
  if (!settingsScoped(canonical)) return { [canonical.key]: value } as Partial<Effect>;
  if (effect.type === "gradient" && canonical.key === "preset" && value !== "custom") {
    const preset = GRADIENT_PRESETS.find((preset) => preset.id === value);
    ensure(preset, "INVALID_COMMAND", "Unknown gradient preset.");
    return {
      seed: preset.seed,
      scale: preset.scale,
      settings: { ...GRADIENT_DEFAULT_SETTINGS, ...gradientPresetSettings(preset) },
    };
  }
  return {
    settings: {
      ...resolveEffectSettings(effect),
      [canonical.key]: value,
      ...(effect.type === "gradient" ? { preset: "custom" } : {}),
    },
  };
}

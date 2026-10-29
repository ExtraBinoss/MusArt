import { AMOUNT, COLOR, LEVELS, defineEffect } from "../definition";
import { GRADIENT_PARAMETERS } from "./parameters";
import type { GradientSettings, GradientSettingKey } from "./model";
import { GRADIENT_PRESETS, gradientPresetSettings } from "./presets";

/** The Stripe field consumes a fixed four-color palette and bypasses the shared domain/palette. */
export const STRIPE_UNUSED_PARAMETERS: readonly GradientSettingKey[] = Object.freeze([
  "colorCount",
  "blending",
  "flow",
  "twist",
  "pressureX",
  "pressureY",
  "shadows",
  "highlights",
  "influence0",
  "influence1",
  "influence2",
  "influence3",
  "influence4",
  "influence5",
]);

export const GRADIENT_DEFAULT_SETTINGS: Readonly<GradientSettings> = Object.freeze(
  Object.fromEntries(
    GRADIENT_PARAMETERS.map((parameter) => [
      parameter.key,
      "default" in parameter ? parameter.default : undefined,
    ]),
  ) as unknown as GradientSettings,
);
export function resolveGradientSettings(
  settings: Partial<GradientSettings> = {},
): GradientSettings {
  const preset = GRADIENT_PRESETS.find((preset) => preset.id === settings.preset);
  return {
    ...GRADIENT_DEFAULT_SETTINGS,
    ...(preset ? gradientPresetSettings(preset) : {}),
    ...settings,
  };
}
export const GRADIENT_DEFINITION = defineEffect(
  "gradient",
  {
    scale: 1,
    seed: 60,
    color: true,
    time: 0,
    settings: { ...GRADIENT_DEFAULT_SETTINGS },
  },
  [
    ...GRADIENT_PARAMETERS.slice(0, 3),
    AMOUNT,
    {
      kind: "number",
      key: "scale",
      labelKey: "gradientFx:parameter.scale",
      min: 0.3,
      max: 4,
      documentMin: 0.1,
      documentMax: 128,
      step: 0.01,
      displayScale: 1,
      unit: "×",
    },
    {
      kind: "number",
      key: "seed",
      labelKey: "gradientFx:parameter.seed",
      min: 0,
      max: 99999,
      step: 1,
      displayScale: 1,
      unit: "",
    },
    {
      kind: "number",
      key: "time",
      labelKey: "gradientFx:parameter.time",
      min: 0,
      max: 86400,
      step: 0.05,
      displayScale: 1,
      unit: "s",
    },
    { ...COLOR, visibleWhen: { key: "treatment", values: ["ascii", "dither"] } },
    { ...LEVELS, visibleWhen: { key: "treatment", values: ["dither"] } },
    ...GRADIENT_PARAMETERS.slice(3),
  ],
  "effect",
  "reduce",
);

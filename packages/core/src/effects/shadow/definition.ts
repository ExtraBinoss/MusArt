import { AMOUNT, defineEffect, type EffectParameter } from "../definition";
const numbers = [
  ["offsetX", 0, -256, 256],
  ["offsetY", 8, -256, 256],
  ["radius", 12, 0, 128],
] as const;
const parameters: readonly EffectParameter[] = [
  AMOUNT,
  ...numbers.map(([key, value, min, max]): EffectParameter => ({
    kind: "number",
    scope: "settings",
    key,
    default: value,
    min,
    max,
    step: 0.5,
    displayScale: 1,
    unit: "px",
    labelKey: `shadowFx:parameter.${key}`,
  })),
  {
    kind: "color",
    scope: "settings",
    key: "shadowColor",
    default: "#000000",
    labelKey: "shadowFx:parameter.shadowColor",
  },
];
export const SHADOW_DEFINITION = Object.freeze({
  ...defineEffect(
    "shadow",
    { amount: 0.6, settings: { offsetX: 0, offsetY: 8, radius: 12, shadowColor: "#000000" } },
    parameters,
    "effect",
    "expand",
  ),
  nameKey: "shadowFx:name",
});

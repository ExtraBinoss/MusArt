import { AMOUNT, defineEffect, type EffectParameter } from "../definition";
const numbers = [
  ["progress", 1, 0, 1, 100, "%"],
  ["stagger", 0.45, 0, 0.9, 100, "%"],
  ["inflate", 0.85, 0, 1, 100, "%"],
  ["stretch", 1, 1, 4, 1, "×"],
] as const;
const parameters: EffectParameter[] = [
  AMOUNT,
  ...numbers.map(([key, value, min, max, displayScale, unit]): EffectParameter => ({
    kind: "number",
    scope: "settings",
    key,
    default: value,
    min,
    max,
    step: 0.01,
    displayScale,
    unit,
    labelKey: `morphFx:${key}`,
  })),
  {
    kind: "select",
    scope: "settings",
    key: "order",
    default: "forward",
    labelKey: "morphFx:order",
    options: ["forward", "reverse", "center"].map((value) => ({
      value,
      labelKey: `morphFx:${value}`,
    })),
  },
];
export const MORPH_DEFINITION = Object.freeze({
  ...defineEffect(
    "morph",
    { settings: { progress: 1, stagger: 0.45, inflate: 0.85, stretch: 1, order: "forward" } },
    parameters,
  ),
  nameKey: "morphFx:name",
  source: "geometry" as const,
});

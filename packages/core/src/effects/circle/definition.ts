import type { EffectSettings } from "../../document/model";
import {
  AMOUNT,
  defineEffect,
  type EffectParameter,
  type NumberEffectParameter,
} from "../definition";

const number = (
  key: string,
  value: number,
  min: number,
  max: number,
  step: number,
  unit = "",
): NumberEffectParameter => ({
  kind: "number",
  scope: "settings",
  key,
  default: value,
  labelKey: `circleFx:parameter.${key}`,
  min,
  max,
  step,
  displayScale: 1,
  unit,
});
export const CIRCLE_DEFAULT_SETTINGS: Readonly<EffectSettings> = Object.freeze({
  spacing: 12,
  rotation: 45,
  dotSize: 1,
  softness: 1,
  gamma: 1,
  polarity: "shadows",
  foreground: "#151515",
  background: "#ffffff",
  foregroundOpacity: 1,
  backgroundOpacity: 1,
});
export const CIRCLE_PARAMETERS: readonly EffectParameter[] = Object.freeze([
  AMOUNT,
  number("spacing", 12, 2, 256, 0.5, "px"),
  number("rotation", 45, -180, 180, 1, "°"),
  { ...number("dotSize", 1, 0, 1, 0.01, "%"), displayScale: 100 },
  number("softness", 1, 0, 16, 0.1, "px"),
  number("gamma", 1, 0.1, 4, 0.05),
  {
    kind: "select",
    scope: "settings",
    key: "polarity",
    labelKey: "circleFx:parameter.polarity",
    default: "shadows",
    options: [
      { value: "shadows", labelKey: "circleFx:polarity.shadows" },
      { value: "highlights", labelKey: "circleFx:polarity.highlights" },
    ],
  },
  ...(["foreground", "background"] as const).flatMap((key): EffectParameter[] => [
    {
      kind: "color",
      scope: "settings",
      key,
      labelKey: `circleFx:parameter.${key}`,
      default: key === "foreground" ? "#151515" : "#ffffff",
    },
    { ...number(`${key}Opacity`, 1, 0, 1, 0.01, "%"), displayScale: 100 },
  ]),
]);
export const CIRCLE_DEFINITION = defineEffect(
  "circle",
  { scale: 1, settings: CIRCLE_DEFAULT_SETTINGS },
  CIRCLE_PARAMETERS,
  "effect",
  "reduce",
);

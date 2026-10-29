import type { EffectSettings } from "../../document/model";
import {
  AMOUNT,
  LEVELS,
  SEED,
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
  labelKey: `datamoshFx:parameter.${key}`,
  min,
  max,
  step,
  displayScale: 1,
  unit,
});
export const DATAMOSH_DEFAULT_SETTINGS: Readonly<EffectSettings> = Object.freeze({
  blockSize: 24,
  density: 0.45,
  displacement: 48,
  direction: 0,
  angleVariation: 25,
  coherence: 0.75,
  smear: 0.55,
  chromaShift: 3,
  rate: 2,
});
export const DATAMOSH_PARAMETERS: readonly EffectParameter[] = Object.freeze([
  AMOUNT,
  number("blockSize", 24, 2, 256, 1, "px"),
  { ...number("density", 0.45, 0, 1, 0.01, "%"), displayScale: 100 },
  number("displacement", 48, 0, 512, 1, "px"),
  number("direction", 0, -180, 180, 1, "°"),
  number("angleVariation", 25, 0, 180, 1, "°"),
  { ...number("coherence", 0.75, 0, 1, 0.01, "%"), displayScale: 100 },
  { ...number("smear", 0.55, 0, 1, 0.01, "%"), displayScale: 100 },
  number("chromaShift", 3, 0, 64, 0.5, "px"),
  { ...LEVELS, labelKey: "datamoshFx:parameter.levels" },
  number("rate", 2, 0, 30, 0.25, "Hz"),
  SEED,
  {
    kind: "number",
    key: "time",
    labelKey: "datamoshFx:parameter.time",
    min: 0,
    max: 86400,
    step: 0.01,
    displayScale: 1,
    unit: "s",
  },
]);
export const DATAMOSH_DEFINITION = defineEffect(
  "datamosh",
  { scale: 1, levels: 32, seed: 42, time: 0, settings: DATAMOSH_DEFAULT_SETTINGS },
  DATAMOSH_PARAMETERS,
);

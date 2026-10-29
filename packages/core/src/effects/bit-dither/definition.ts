import {
  AMOUNT,
  SEED,
  defineEffect,
  type EffectParameter,
  type NumberEffectParameter,
} from "../definition";

export const BIT_DITHER_METHODS = [
  "threshold",
  "bayer2",
  "bayer4",
  "bayer8",
  "interleaved",
] as const;
const number = (key: string, value: number, min: number, max: number): NumberEffectParameter => ({
  kind: "number",
  scope: "settings",
  key,
  default: value,
  labelKey: `bit-ditherFx:parameter.${key}`,
  min,
  max,
  step: 0.01,
  displayScale: 1,
  unit: "",
});
export const BIT_DITHER_PARAMETERS: readonly EffectParameter[] = [
  AMOUNT,
  {
    kind: "select",
    scope: "settings",
    key: "method",
    default: "bayer4",
    labelKey: "bit-ditherFx:parameter.method",
    options: BIT_DITHER_METHODS.map((value) => ({
      value,
      labelKey: `bit-ditherFx:method.${value}`,
    })),
  },
  {
    kind: "number",
    key: "scale",
    labelKey: "bit-ditherFx:parameter.scale",
    min: 1,
    max: 64,
    step: 1,
    displayScale: 1,
    unit: "px",
  },
  SEED,
  number("threshold", 0.5, 0, 1),
  {
    ...number("strength", 1, 0, 1),
    visibleWhen: { key: "method", values: ["bayer2", "bayer4", "bayer8", "interleaved"] },
  },
  number("contrast", 1, 0.05, 8),
  number("gamma", 1, 0.1, 5),
  {
    kind: "boolean",
    scope: "settings",
    key: "invert",
    default: false,
    labelKey: "bit-ditherFx:parameter.invert",
  },
  ...(["foreground", "background"] as const).map((key): EffectParameter => ({
    kind: "color",
    scope: "settings",
    key,
    default: key === "foreground" ? "#000000" : "#ffffff",
    labelKey: `bit-ditherFx:parameter.${key}`,
  })),
];
export const BIT_DITHER_DEFAULT_SETTINGS = Object.freeze(
  Object.fromEntries(
    BIT_DITHER_PARAMETERS.filter((parameter) => parameter.scope === "settings").map((parameter) => [
      parameter.key,
      parameter.default,
    ]),
  ),
);
/** Two-color quantization is separate from the existing multilevel Dither effect. */
export const BIT_DITHER_DEFINITION = Object.freeze({
  ...defineEffect(
    "bit-dither",
    { scale: 1, seed: 42, settings: BIT_DITHER_DEFAULT_SETTINGS },
    BIT_DITHER_PARAMETERS,
  ),
  nameKey: "bit-ditherFx:name",
});

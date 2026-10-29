import {
  AMOUNT,
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
  unit = "",
): NumberEffectParameter => ({
  kind: "number",
  scope: "settings",
  key,
  default: value,
  labelKey: `pink-phosphorFx:parameter.${key}`,
  min,
  max,
  step: 0.01,
  displayScale: 1,
  unit,
});
export const PINK_PHOSPHOR_PARAMETERS: readonly EffectParameter[] = [
  AMOUNT,
  {
    kind: "number",
    key: "scale",
    labelKey: "pink-phosphorFx:parameter.scale",
    min: 2,
    max: 16,
    step: 0.1,
    displayScale: 1,
    unit: "px",
  },
  SEED,
  number("exposure", 0, -4, 4, "EV"),
  number("gamma", 1, 0.1, 4),
  number("contrast", 1, 0.1, 4),
  number("glow", 0.3, 0, 2),
  number("glowRadius", 3, 0, 32, "px"),
  number("glowThreshold", 0.55, 0, 1),
  number("scanlines", 0.3, 0, 1),
  number("beamWidth", 0.65, 0.1, 1),
  number("grain", 0.04, 0, 0.5),
  number("flicker", 0.03, 0, 0.3),
  number("speed", 1, 0, 8, "/s"),
  ...(
    [
      ["background", "#100416"],
      ["phosphor", "#ff4fa9"],
      ["highlight", "#fff0fa"],
    ] as const
  ).map(([key, value]): EffectParameter => ({
    kind: "color",
    scope: "settings",
    key,
    default: value,
    labelKey: `pink-phosphorFx:parameter.${key}`,
  })),
  {
    kind: "number",
    key: "time",
    labelKey: "pink-phosphorFx:parameter.time",
    min: 0,
    max: 86400,
    step: 0.01,
    displayScale: 1,
    unit: "s",
  },
];
export const PINK_PHOSPHOR_DEFAULT_SETTINGS = Object.freeze(
  Object.fromEntries(
    PINK_PHOSPHOR_PARAMETERS.filter((parameter) => parameter.scope === "settings").map(
      (parameter) => [parameter.key, parameter.default],
    ),
  ),
);
/** Deterministic artistic emission, not a phosphor-history simulation. */
export const PINK_PHOSPHOR_DEFINITION = Object.freeze({
  ...defineEffect(
    "pink-phosphor",
    { amount: 1, scale: 3, seed: 42, time: 0, settings: PINK_PHOSPHOR_DEFAULT_SETTINGS },
    PINK_PHOSPHOR_PARAMETERS,
  ),
  nameKey: "pink-phosphorFx:name",
});

import {
  AMOUNT,
  COLOR,
  SEED,
  defineEffect,
  type EffectParameter,
  type NumberEffectParameter,
} from "../definition";

export const NOISE_ALGORITHMS = [
  "perlin",
  "value",
  "cell",
  "worley",
  "fbm",
  "ridged",
  "turbulence",
] as const;
const fractals = { key: "algorithm", values: ["fbm", "ridged", "turbulence"] };
function number(
  key: string,
  value: number,
  min: number,
  max: number,
  step = 0.01,
  unit = "",
): NumberEffectParameter {
  return {
    kind: "number",
    scope: "settings",
    key,
    default: value,
    labelKey: `noiseFx:parameter.${key}`,
    min,
    max,
    step,
    displayScale: 1,
    unit,
  };
}
export const NOISE_PARAMETERS: readonly EffectParameter[] = [
  AMOUNT,
  {
    kind: "select",
    scope: "settings",
    key: "algorithm",
    default: "perlin",
    labelKey: "noiseFx:parameter.algorithm",
    options: NOISE_ALGORITHMS.map((value) => ({ value, labelKey: `noiseFx:algorithm.${value}` })),
  },
  {
    kind: "number",
    key: "scale",
    labelKey: "noiseFx:parameter.scale",
    min: 1,
    max: 2048,
    step: 1,
    displayScale: 1,
    unit: "px",
  },
  SEED,
  COLOR,
  { ...number("octaves", 4, 1, 6, 1), integer: true, visibleWhen: fractals },
  { ...number("lacunarity", 2, 1, 3), visibleWhen: fractals },
  { ...number("persistence", 0.5, 0, 1), visibleWhen: fractals },
  { ...number("jitter", 1, 0, 1), visibleWhen: { key: "algorithm", values: ["worley"] } },
  number("offsetX", 0, -32768, 32768, 0.5, "px"),
  number("offsetY", 0, -32768, 32768, 0.5, "px"),
  number("offsetZ", 0, -1024, 1024),
  number("speed", 0.25, 0, 4, 0.01, "/s"),
  number("contrast", 1, 0.05, 8),
  number("brightness", 0, -1, 1),
  number("gamma", 1, 0.1, 5),
  {
    kind: "boolean",
    scope: "settings",
    key: "invert",
    default: false,
    labelKey: "noiseFx:parameter.invert",
  },
  {
    kind: "select",
    scope: "settings",
    key: "mode",
    default: "replace",
    labelKey: "noiseFx:parameter.mode",
    options: ["replace", "add", "multiply"].map((value) => ({
      value,
      labelKey: `noiseFx:mode.${value}`,
    })),
  },
  {
    kind: "color",
    scope: "settings",
    key: "lowColor",
    default: "#000000",
    labelKey: "noiseFx:parameter.lowColor",
  },
  {
    kind: "color",
    scope: "settings",
    key: "highColor",
    default: "#ffffff",
    labelKey: "noiseFx:parameter.highColor",
  },
  {
    kind: "number",
    key: "time",
    labelKey: "noiseFx:parameter.time",
    min: 0,
    max: 86400,
    step: 0.01,
    displayScale: 1,
    unit: "s",
  },
];
export const NOISE_DEFAULT_SETTINGS = Object.freeze(
  Object.fromEntries(
    NOISE_PARAMETERS.filter((parameter) => parameter.scope === "settings").map((parameter) => [
      parameter.key,
      parameter.default,
    ]),
  ),
);
/** Bounded 3D fields share one portable seed and explicit document time. */
export const NOISE_DEFINITION = Object.freeze({
  ...defineEffect(
    "noise",
    { amount: 1, scale: 128, seed: 42, color: false, time: 0, settings: NOISE_DEFAULT_SETTINGS },
    NOISE_PARAMETERS,
  ),
  nameKey: "noiseFx:name",
});

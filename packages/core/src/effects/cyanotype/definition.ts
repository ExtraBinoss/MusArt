import {
  AMOUNT,
  SEED,
  defineEffect,
  type EffectParameter,
  type NumberEffectParameter,
} from "../definition";
import type { EffectSettings } from "../../document/model";
function number(
  key: string,
  value: number,
  min: number,
  max: number,
  step: number,
  unit = "",
  displayScale = 1,
): NumberEffectParameter {
  return {
    kind: "number",
    scope: "settings",
    key,
    default: value,
    min,
    max,
    step,
    unit,
    displayScale,
    labelKey: `cyanotypeFx:parameter.${key}`,
  };
}
export const CYANOTYPE_PARAMETERS: readonly EffectParameter[] = [
  AMOUNT,
  number("exposure", 0, -4, 4, 0.05, "EV"),
  number("contrast", 1.15, 0.05, 4, 0.01),
  number("gamma", 1, 0.1, 5, 0.01),
  number("density", 1.15, 0.1, 4, 0.01),
  number("blackPoint", 0.02, 0, 0.45, 0.005, "%", 100),
  number("whitePoint", 0.98, 0.55, 1, 0.005, "%", 100),
  {
    kind: "boolean",
    scope: "settings",
    key: "invert",
    default: false,
    labelKey: "cyanotypeFx:parameter.invert",
  },
  {
    kind: "color",
    scope: "settings",
    key: "inkColor",
    default: "#123d78",
    labelKey: "cyanotypeFx:parameter.inkColor",
  },
  {
    kind: "color",
    scope: "settings",
    key: "paperColor",
    default: "#f4f1df",
    labelKey: "cyanotypeFx:parameter.paperColor",
  },
  number("wash", 0.08, 0, 1, 0.01, "%", 100),
  number("unevenness", 0.15, 0, 1, 0.01, "%", 100),
  number("textureScale", 96, 2, 2048, 0.5, "px"),
  number("paperGrain", 0.04, 0, 0.5, 0.005, "%", 100),
  number("grainScale", 1, 0.5, 32, 0.5, "px"),
  number("fibers", 0.04, 0, 0.5, 0.005, "%", 100),
  number("fiberScale", 6, 0.5, 64, 0.5, "px"),
  number("edgeFade", 0.05, 0, 1, 0.01, "%", 100),
  number("edgeWidth", 32, 1, 512, 1, "px"),
  SEED,
];
export const CYANOTYPE_DEFAULT_SETTINGS: Readonly<EffectSettings> = Object.freeze(
  Object.fromEntries(
    CYANOTYPE_PARAMETERS.filter((parameter) => parameter.scope === "settings").map((parameter) => [
      parameter.key,
      parameter.default,
    ]),
  ),
);
export const CYANOTYPE_DEFINITION = Object.freeze({
  ...defineEffect("cyanotype", { settings: CYANOTYPE_DEFAULT_SETTINGS }, CYANOTYPE_PARAMETERS),
  nameKey: "cyanotypeFx:name",
});

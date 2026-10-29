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
  step = 0.01,
  unit = "",
  displayScale = 1,
): NumberEffectParameter {
  return {
    kind: "number",
    scope: "settings",
    key,
    default: value,
    labelKey: `shatterFx:parameter.${key}`,
    min,
    max,
    step,
    displayScale,
    unit,
  };
}

export const SHATTER_PARAMETERS: readonly EffectParameter[] = [
  AMOUNT,
  {
    kind: "number",
    key: "scale",
    labelKey: "shatterFx:parameter.scale",
    min: 8,
    max: 512,
    step: 1,
    displayScale: 1,
    unit: "px",
  },
  SEED,
  {
    kind: "select",
    scope: "settings",
    key: "pattern",
    default: "impact",
    labelKey: "shatterFx:parameter.pattern",
    options: [
      { value: "impact", labelKey: "shatterFx:pattern.impact" },
      { value: "cellular", labelKey: "shatterFx:pattern.cellular" },
    ],
  },
  number("centerX", 0.5, 0, 1, 0.01, "%", 100),
  number("centerY", 0.5, 0, 1, 0.01, "%", 100),
  number("radius", 0.95, 0.05, 2, 0.01, "%", 100),
  number("innerRadius", 0, 0, 1.95, 0.01, "%", 100),
  number("falloff", 1, 0.25, 4, 0.05, "×"),
  number("jitter", 0.6, 0, 1, 0.01, "%", 100),
  {
    ...number("spokes", 18, 6, 48, 1),
    integer: true,
    visibleWhen: { key: "pattern", values: ["impact"] },
  },
  number("displacement", 8, 0, 64, 0.1, "px"),
  number("rotation", 4, 0, 45, 0.1, "°"),
  number("ior", 1.52, 1, 2.5, 0.01),
  number("thickness", 24, 0, 96, 0.1, "px"),
  number("dispersion", 0.18, 0, 1, 0.01, "%", 100),
  number("tilt", 0.5, 0, 1, 0.01, "%", 100),
  number("roughness", 0.08, 0, 1, 0.01, "%", 100),
  number("crackWidth", 1.1, 0, 8, 0.1, "px"),
  number("cracks", 0.9, 0, 1, 0.01, "%", 100),
  number("highlights", 1.25, 0, 3, 0.05, "×"),
  number("tintStrength", 0.1, 0, 1, 0.01, "%", 100),
  {
    kind: "color",
    scope: "settings",
    key: "tintColor",
    default: "#dcefff",
    labelKey: "shatterFx:parameter.tintColor",
  },
  {
    kind: "color",
    scope: "settings",
    key: "crackColor",
    default: "#10141a",
    labelKey: "shatterFx:parameter.crackColor",
  },
  {
    kind: "color",
    scope: "settings",
    key: "highlightColor",
    default: "#cbe5f7",
    labelKey: "shatterFx:parameter.highlightColor",
  },
  {
    kind: "boolean",
    scope: "settings",
    key: "cutout",
    default: false,
    labelKey: "shatterFx:parameter.cutout",
  },
];

export const SHATTER_DEFAULT_SETTINGS: Readonly<EffectSettings> = Object.freeze(
  Object.fromEntries(
    SHATTER_PARAMETERS.filter((parameter) => parameter.scope === "settings").map(
      (parameter) => [parameter.key, parameter.default] as const,
    ),
  ),
);

/** Procedural image refraction; transparent crack coverage is an explicit opt-in. */
export const SHATTER_DEFINITION = Object.freeze({
  ...defineEffect(
    "shatter",
    { amount: 1, scale: 72, seed: 42, settings: SHATTER_DEFAULT_SETTINGS },
    SHATTER_PARAMETERS,
  ),
  coverage: "reduce" as const,
  nameKey: "shatterFx:name",
  gizmo: Object.freeze({
    kind: "radial" as const,
    centerX: "centerX",
    centerY: "centerY",
    radius: "radius",
    innerRadius: "innerRadius",
    radiusUnits: "relative-min" as const,
  }),
});

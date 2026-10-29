import {
  AMOUNT,
  SEED,
  defineEffect,
  type EffectParameter,
  type NumberEffectParameter,
} from "../definition";

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
    labelKey: `flashlightFx:parameter.${key}`,
    min,
    max,
    step,
    unit,
    displayScale,
  };
}
export const FLASHLIGHT_PARAMETERS: readonly EffectParameter[] = [
  AMOUNT,
  number("centerX", 0.5, 0, 1, 0.001, "%", 100),
  number("centerY", 0.45, 0, 1, 0.001, "%", 100),
  number("radius", 0.68, 0.02, 2, 0.005, "%", 100),
  number("softness", 0.65, 0, 1, 0.01, "%", 100),
  number("falloff", 1.4, 0.25, 8, 0.05),
  number("aspect", 1, 0.2, 4, 0.01),
  number("rotation", 0, -180, 180, 0.5, "°"),
  number("intensity", 1.35, 0, 8, 0.01),
  number("ambient", 0.08, 0, 1, 0.01, "%", 100),
  number("exposure", 0, -4, 4, 0.05, "EV"),
  number("highlightCompression", 0.35, 0, 1, 0.01, "%", 100),
  number("saturation", 1, 0, 2, 0.01, "%", 100),
  number("glow", 0.03, 0, 1, 0.005, "%", 100),
  number("grain", 0.015, 0, 0.5, 0.005, "%", 100),
  number("grainSize", 1, 1, 32, 0.5, "px"),
  SEED,
  {
    kind: "color",
    scope: "settings",
    key: "lightColor",
    default: "#fff0d9",
    labelKey: "flashlightFx:parameter.lightColor",
  },
  {
    kind: "boolean",
    scope: "settings",
    key: "invert",
    default: false,
    labelKey: "flashlightFx:parameter.invert",
  },
];
export const FLASHLIGHT_DEFAULT_SETTINGS = Object.freeze(
  Object.fromEntries(
    FLASHLIGHT_PARAMETERS.filter((parameter) => parameter.scope === "settings").map((parameter) => [
      parameter.key,
      parameter.default,
    ]),
  ),
);
/** Image-space illumination, with no invented surface normals or hidden wall clock. */
export const FLASHLIGHT_DEFINITION = Object.freeze({
  ...defineEffect("flashlight", { settings: FLASHLIGHT_DEFAULT_SETTINGS }, FLASHLIGHT_PARAMETERS),
  nameKey: "flashlightFx:name",
  gizmo: Object.freeze({
    kind: "radial" as const,
    centerX: "centerX",
    centerY: "centerY",
    radius: "radius",
    radiusUnits: "relative-min" as const,
    aspect: "aspect",
    rotation: "rotation",
  }),
});

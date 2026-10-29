import { AMOUNT, defineEffect, type NumberEffectParameter } from "../definition";

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
  labelKey: `rippleFx:parameter.${key}`,
  min,
  max,
  step,
  displayScale: 1,
  unit,
});

export const RIPPLE_DEFAULT_SETTINGS = Object.freeze({
  centerX: 0.5,
  centerY: 0.5,
  innerRadius: 96,
  radius: 480,
  feather: 48,
  falloff: 1,
  amplitude: 12,
  wavelength: 64,
  speed: 48,
  phase: 0,
  direction: "outward",
  dispersion: 0,
});

export const RIPPLE_DEFINITION = Object.freeze({
  ...defineEffect("ripple", { scale: 1, time: 0, settings: RIPPLE_DEFAULT_SETTINGS }, [
    AMOUNT,
    { ...number("centerX", 0.5, 0, 1, 0.001, "%"), displayScale: 100 },
    { ...number("centerY", 0.5, 0, 1, 0.001, "%"), displayScale: 100 },
    number("innerRadius", 96, 0, 8192, 1, "px"),
    number("radius", 480, 1, 8192, 1, "px"),
    number("feather", 48, 0, 2048, 1, "px"),
    number("falloff", 1, 0, 8, 0.05),
    number("amplitude", 12, 0, 256, 0.1, "px"),
    number("wavelength", 64, 2, 2048, 0.5, "px"),
    number("speed", 48, 0, 1024, 0.5, "px/s"),
    number("phase", 0, 0, 360, 1, "°"),
    {
      kind: "select",
      scope: "settings",
      key: "direction",
      labelKey: "rippleFx:parameter.direction",
      default: "outward",
      options: [
        { value: "outward", labelKey: "rippleFx:direction.outward" },
        { value: "inward", labelKey: "rippleFx:direction.inward" },
      ],
    },
    number("dispersion", 0, 0, 1, 0.01),
    {
      kind: "number",
      key: "time",
      labelKey: "rippleFx:parameter.time",
      min: 0,
      max: 86400,
      step: 0.01,
      displayScale: 1,
      unit: "s",
    },
  ]),
  gizmo: Object.freeze({
    kind: "radial" as const,
    centerX: "centerX",
    centerY: "centerY",
    radius: "radius",
    innerRadius: "innerRadius",
    radiusUnits: "document" as const,
  }),
});

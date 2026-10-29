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
    labelKey: `crtFx:parameter.${key}`,
    min,
    max,
    step,
    displayScale,
    unit,
  };
}

export const CRT_PARAMETERS: readonly EffectParameter[] = [
  AMOUNT,
  {
    kind: "number",
    key: "scale",
    labelKey: "crtFx:parameter.scale",
    min: 1,
    max: 12,
    step: 0.1,
    displayScale: 1,
    unit: "px",
  },
  SEED,
  {
    kind: "select",
    scope: "settings",
    key: "mask",
    default: "aperture",
    labelKey: "crtFx:parameter.mask",
    options: [
      { value: "aperture", labelKey: "crtFx:mask.aperture" },
      { value: "shadow", labelKey: "crtFx:mask.shadow" },
      { value: "slot", labelKey: "crtFx:mask.slot" },
    ],
  },
  number("maskStrength", 0.35, 0, 1, 0.01, "%", 100),
  number("maskGap", 0.12, 0, 0.8, 0.01, "%", 100),
  number("scanlineStrength", 0.3, 0, 1, 0.01, "%", 100),
  number("scanlinePitch", 3, 1, 24, 0.1, "px"),
  number("scanlineWidth", 0.65, 0.1, 1, 0.01, "%", 100),
  number("scanlinePhase", 0, 0, 1, 0.01, "%", 100),
  number("curvatureX", 0.08, 0, 0.5, 0.01, "%", 100),
  number("curvatureY", 0.06, 0, 0.5, 0.01, "%", 100),
  number("zoom", 1.03, 0.5, 1.5, 0.01, "×"),
  number("convergence", 0.7, 0, 12, 0.1, "px"),
  number("glow", 0.15, 0, 2, 0.01, "%", 100),
  number("glowRadius", 2, 0, 24, 0.1, "px"),
  number("brightness", 1.1, 0, 3, 0.01, "×"),
  number("contrast", 1.08, 0, 3, 0.01, "×"),
  number("saturation", 1, 0, 2, 0.01, "%", 100),
  {
    kind: "color",
    scope: "settings",
    key: "tintColor",
    default: "#ffffff",
    labelKey: "crtFx:parameter.tintColor",
  },
  number("vignette", 0.2, 0, 1, 0.01, "%", 100),
  number("roundness", 0.06, 0, 0.5, 0.01, "%", 100),
  number("borderSoftness", 1, 0.1, 8, 0.1, "px"),
  {
    kind: "color",
    scope: "settings",
    key: "bezelColor",
    default: "#050608",
    labelKey: "crtFx:parameter.bezelColor",
  },
  number("noise", 0.015, 0, 0.5, 0.005, "%", 100),
  number("jitter", 0.2, 0, 12, 0.1, "px"),
  number("flicker", 0.03, 0, 0.5, 0.01, "%", 100),
  number("flickerRate", 8, 0, 60, 0.1, "Hz"),
  number("rollingBar", 0.04, 0, 1, 0.01, "%", 100),
  number("rollingSpeed", 0.2, -2, 2, 0.01, "Hz"),
  {
    kind: "boolean",
    scope: "settings",
    key: "cutout",
    default: false,
    labelKey: "crtFx:parameter.cutout",
  },
  {
    kind: "number",
    key: "time",
    labelKey: "crtFx:parameter.time",
    min: 0,
    max: 86400,
    step: 0.01,
    displayScale: 1,
    unit: "s",
  },
];

export const CRT_DEFAULT_SETTINGS: Readonly<EffectSettings> = Object.freeze(
  Object.fromEntries(
    CRT_PARAMETERS.filter((p) => p.scope === "settings").map((p) => [p.key, p.default] as const),
  ),
);

/** Image-based CRT display; screen clipping changes coverage only when explicitly enabled. */
export const CRT_DEFINITION = Object.freeze({
  ...defineEffect(
    "crt",
    { amount: 1, scale: 1.5, seed: 42, time: 0, settings: CRT_DEFAULT_SETTINGS },
    CRT_PARAMETERS,
  ),
  coverage: "reduce" as const,
  nameKey: "crtFx:name",
});

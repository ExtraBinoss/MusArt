import {
  AMOUNT,
  SEED,
  defineEffect,
  type EffectParameter,
  type NumberEffectParameter,
} from "../definition";
import type { EffectSettings } from "../../document/model";

const number = (
  key: string,
  value: number,
  min: number,
  max: number,
  step = 0.01,
  unit = "",
  displayScale = 1,
): NumberEffectParameter => ({
  kind: "number",
  scope: "settings",
  key,
  default: value,
  labelKey: `receiptFx:parameter.${key}`,
  min,
  max,
  step,
  displayScale,
  unit,
});
export const RECEIPT_PARAMETERS: readonly EffectParameter[] = [
  AMOUNT,
  {
    kind: "number",
    key: "scale",
    labelKey: "receiptFx:parameter.scale",
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
    key: "mode",
    default: "ordered",
    labelKey: "receiptFx:parameter.mode",
    options: [
      { value: "ordered", labelKey: "receiptFx:mode.ordered" },
      { value: "stochastic", labelKey: "receiptFx:mode.stochastic" },
      { value: "threshold", labelKey: "receiptFx:mode.threshold" },
    ],
  },
  number("exposure", 0, -1, 1, 0.01),
  number("gamma", 1.1, 0.2, 4, 0.01),
  number("contrast", 1.2, 0, 4, 0.01, "×"),
  {
    kind: "boolean",
    scope: "settings",
    key: "invert",
    default: false,
    labelKey: "receiptFx:parameter.invert",
  },
  {
    kind: "color",
    scope: "settings",
    key: "inkColor",
    default: "#24221e",
    labelKey: "receiptFx:parameter.inkColor",
  },
  {
    kind: "color",
    scope: "settings",
    key: "paperColor",
    default: "#f4efd9",
    labelKey: "receiptFx:parameter.paperColor",
  },
  number("inkOpacity", 0.94, 0, 1, 0.01, "%", 100),
  number("dotSpread", 0.05, -0.3, 0.4, 0.01, "%", 100),
  number("dotSoftness", 0.1, 0.01, 0.6, 0.01, "%", 100),
  number("wear", 0.035, 0, 1, 0.01, "%", 100),
  number("feedBanding", 0.05, 0, 1, 0.01, "%", 100),
  number("feedPitch", 8, 1, 128, 0.1, "px"),
  number("streaks", 0.12, 0, 1, 0.01, "%", 100),
  number("streakWidth", 1.5, 1, 24, 0.1, "px"),
  number("marginX", 0.04, 0, 0.45, 0.01, "%", 100),
  number("marginY", 0.05, 0, 0.45, 0.01, "%", 100),
  {
    kind: "select",
    scope: "settings",
    key: "fit",
    default: "contain",
    labelKey: "receiptFx:parameter.fit",
    options: [
      { value: "contain", labelKey: "receiptFx:fit.contain" },
      { value: "stretch", labelKey: "receiptFx:fit.stretch" },
    ],
  },
  number("paperTexture", 0.035, 0, 0.4, 0.005, "%", 100),
  number("fiberSize", 1.5, 0.25, 16, 0.1, "px"),
  {
    kind: "select",
    scope: "settings",
    key: "edge",
    default: "torn",
    labelKey: "receiptFx:parameter.edge",
    options: [
      { value: "straight", labelKey: "receiptFx:edge.straight" },
      { value: "torn", labelKey: "receiptFx:edge.torn" },
      { value: "perforated", labelKey: "receiptFx:edge.perforated" },
    ],
  },
  {
    ...number("edgeHeight", 4, 0, 32, 0.1, "px"),
    visibleWhen: { key: "edge", values: ["torn", "perforated"] },
  },
  {
    ...number("edgePitch", 12, 2, 128, 0.1, "px"),
    visibleWhen: { key: "edge", values: ["torn", "perforated"] },
  },
  {
    ...number("edgeJitter", 0.35, 0, 1, 0.01, "%", 100),
    visibleWhen: { key: "edge", values: ["torn"] },
  },
  number("edgeSoftness", 0.75, 0.1, 4, 0.05, "px"),
  number("edgeShade", 0.15, 0, 1, 0.01, "%", 100),
  number("foldStrength", 0.12, 0, 1, 0.01, "%", 100),
  number("foldPosition", 0.62, 0, 1, 0.01, "%", 100),
  number("foldWidth", 5, 0.5, 64, 0.1, "px"),
  {
    kind: "boolean",
    scope: "settings",
    key: "cutout",
    default: false,
    labelKey: "receiptFx:parameter.cutout",
  },
];
export const RECEIPT_DEFAULT_SETTINGS: Readonly<EffectSettings> = Object.freeze(
  Object.fromEntries(
    RECEIPT_PARAMETERS.filter((p) => p.scope === "settings").map(
      (p) => [p.key, p.default] as const,
    ),
  ),
);
export const RECEIPT_DEFINITION = Object.freeze({
  ...defineEffect(
    "receipt",
    { amount: 1, scale: 2, seed: 42, settings: RECEIPT_DEFAULT_SETTINGS },
    RECEIPT_PARAMETERS,
  ),
  coverage: "reduce" as const,
  nameKey: "receiptFx:name",
});

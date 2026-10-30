import { AMOUNT, defineEffect, type EffectParameter } from "../definition";
import { TRANSITION_CATALOG } from "./catalog";

const parameters: readonly EffectParameter[] = [
  AMOUNT,
  {
    kind: "select",
    scope: "settings",
    key: "style",
    default: "fade",
    labelKey: "transitions:operator",
    options: TRANSITION_CATALOG.map(({ id, labelKey }) => ({ value: id, labelKey })),
  },
  ...(
    [
      ["progress", 1, 0, 1, 0.001],
      ["softness", 0.02, 0.001, 0.25, 0.001],
      ["strength", 1, 0, 2, 0.01],
      ["detail", 8, 2, 32, 1],
    ] as const
  ).map(([key, value, min, max, step]): EffectParameter => ({
    kind: "number",
    scope: "settings",
    key,
    default: value,
    labelKey: `transitions:parameter.${key}`,
    min,
    max,
    step,
    displayScale: key === "progress" ? 100 : 1,
    unit: key === "progress" ? "%" : "",
    ...(key === "detail" ? { integer: true } : {}),
  })),
  {
    kind: "select",
    scope: "settings",
    key: "direction",
    default: "left",
    labelKey: "transitions:directionLabel",
    options: ["left", "right", "up", "down"].map((value) => ({
      value,
      labelKey: `transitions:direction.${value}`,
    })),
  },
];
/** Identity at rest keeps the base design unchanged when Motion is put aside. */
export const TRANSITION_DEFINITION = Object.freeze({
  ...defineEffect(
    "transition",
    {
      settings: {
        style: "fade",
        progress: 1,
        softness: 0.02,
        strength: 1,
        detail: 8,
        direction: "left",
      },
    },
    parameters,
    "effect",
    "reduce",
  ),
  nameKey: "transitions:title",
});

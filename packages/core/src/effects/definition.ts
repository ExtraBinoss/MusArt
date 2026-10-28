import type { Effect, EffectType } from "../document/model";
import type { GradientSettingKey } from "./gradient/model";

export interface NumberEffectParameter {
  readonly kind: "number";
  readonly key: "amount" | "scale" | "levels" | "seed" | "time" | GradientSettingKey;
  readonly scope?: "settings";
  readonly default?: number;
  readonly visibleWhen?: { readonly key: GradientSettingKey; readonly values: readonly string[] };
  readonly labelKey: string;
  /** Bounds and step are expressed in document units, before displayScale. */
  readonly integer?: boolean;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly displayScale: number;
  readonly unit: string;
}
export interface BooleanEffectParameter {
  readonly kind: "boolean";
  readonly key: "color";
  readonly labelKey: string;
  readonly visibleWhen?: { readonly key: GradientSettingKey; readonly values: readonly string[] };
}
export interface ChoiceEffectParameter {
  readonly kind: "select";
  readonly key: GradientSettingKey;
  readonly scope: "settings";
  readonly labelKey: string;
  readonly default: string;
  readonly options: readonly { readonly value: string; readonly labelKey: string }[];
  readonly visibleWhen?: { readonly key: GradientSettingKey; readonly values: readonly string[] };
}
export interface ColorEffectParameter {
  readonly kind: "color";
  readonly key: GradientSettingKey;
  readonly scope: "settings";
  readonly labelKey: string;
  readonly default: string;
  readonly visibleWhen?: { readonly key: GradientSettingKey; readonly values: readonly string[] };
}
export type EffectParameter =
  | NumberEffectParameter
  | BooleanEffectParameter
  | ChoiceEffectParameter
  | ColorEffectParameter;
export interface EffectDefinition {
  readonly type: EffectType;
  readonly nameKey: string;
  readonly category: "effect" | "adjustment";
  readonly defaults: Readonly<Omit<Effect, "id" | "type">>;
  readonly parameters: readonly EffectParameter[];
}
export const DEFAULTS: Readonly<Omit<Effect, "id" | "type">> = {
  enabled: true,
  amount: 1,
  scale: 2,
  levels: 2,
  color: false,
  seed: 42,
};
export const AMOUNT: NumberEffectParameter = {
  kind: "number",
  key: "amount",
  labelKey: "amount",
  min: 0,
  max: 1,
  step: 0.01,
  displayScale: 100,
  unit: "%",
};
export const SCALE: NumberEffectParameter = {
  kind: "number",
  key: "scale",
  labelKey: "effectScale",
  min: 1,
  max: 128,
  step: 1,
  displayScale: 1,
  unit: "px",
};
export const LEVELS: NumberEffectParameter = {
  kind: "number",
  key: "levels",
  labelKey: "levels",
  min: 2,
  max: 256,
  step: 1,
  displayScale: 1,
  unit: "",
};
export const COLOR: BooleanEffectParameter = { kind: "boolean", key: "color", labelKey: "colored" };
export const SEED: NumberEffectParameter = {
  kind: "number",
  key: "seed",
  labelKey: "effectControls:seed",
  min: 0,
  max: 2147483647,
  step: 1,
  integer: true,
  displayScale: 1,
  unit: "",
};

export function defineEffect(
  type: EffectType,
  defaults: Partial<EffectDefinition["defaults"]>,
  parameters: readonly EffectParameter[],
  category: EffectDefinition["category"] = "effect",
): EffectDefinition {
  return Object.freeze({
    type,
    nameKey: type,
    category,
    defaults: Object.freeze({
      ...DEFAULTS,
      ...defaults,
      ...(defaults.settings ? { settings: Object.freeze({ ...defaults.settings }) } : {}),
    }),
    parameters: Object.freeze(
      parameters.map((parameter) =>
        Object.freeze({
          ...parameter,
          ...("visibleWhen" in parameter && parameter.visibleWhen
            ? {
                visibleWhen: Object.freeze({
                  ...parameter.visibleWhen,
                  values: Object.freeze([...parameter.visibleWhen.values]),
                }),
              }
            : {}),
          ...(parameter.kind === "select"
            ? {
                options: Object.freeze(
                  parameter.options.map((option) => Object.freeze({ ...option })),
                ),
              }
            : {}),
        }),
      ),
    ),
  });
}

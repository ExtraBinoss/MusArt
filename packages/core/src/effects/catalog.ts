import { ensure } from "../errors";
import type { Effect, EffectType } from "../document/model";

export interface NumberEffectParameter {
  readonly kind: "number";
  readonly key: "amount" | "scale" | "levels";
  readonly labelKey: string;
  /** Bounds and step are expressed in document units, before displayScale. */
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
}
export type EffectParameter = NumberEffectParameter | BooleanEffectParameter;
export interface EffectDefinition {
  readonly type: EffectType;
  readonly nameKey: string;
  readonly defaults: Readonly<Omit<Effect, "id" | "type">>;
  readonly parameters: readonly EffectParameter[];
}
const DEFAULTS: Readonly<Omit<Effect, "id" | "type">> = {
  enabled: true,
  amount: 1,
  scale: 2,
  levels: 2,
  color: false,
  seed: 42,
};
const AMOUNT: NumberEffectParameter = {
  kind: "number",
  key: "amount",
  labelKey: "amount",
  min: 0,
  max: 1,
  step: 0.01,
  displayScale: 100,
  unit: "%",
};
const SCALE: NumberEffectParameter = {
  kind: "number",
  key: "scale",
  labelKey: "effectScale",
  min: 1,
  max: 24,
  step: 1,
  displayScale: 1,
  unit: "px",
};
const LEVELS: NumberEffectParameter = {
  kind: "number",
  key: "levels",
  labelKey: "levels",
  min: 2,
  max: 16,
  step: 1,
  displayScale: 1,
  unit: "",
};
const COLOR: BooleanEffectParameter = { kind: "boolean", key: "color", labelKey: "colored" };

function defineEffect(
  type: EffectType,
  defaults: Partial<EffectDefinition["defaults"]>,
  parameters: readonly EffectParameter[],
): EffectDefinition {
  return Object.freeze({
    type,
    nameKey: type,
    defaults: Object.freeze({ ...DEFAULTS, ...defaults }),
    parameters: Object.freeze(parameters.map((parameter) => Object.freeze(parameter))),
  });
}

/** Portable effect metadata shared by factories, validation and client controls. */
export const EFFECT_CATALOG: Readonly<Record<EffectType, EffectDefinition>> = Object.freeze({
  dither: defineEffect("dither", {}, [AMOUNT, SCALE, LEVELS, COLOR]),
  ascii: defineEffect("ascii", { scale: 10, levels: 10, color: true }, [
    AMOUNT,
    { ...SCALE, max: 48 },
    COLOR,
  ]),
  brightness: defineEffect("brightness", { amount: 0.5 }, [AMOUNT]),
  contrast: defineEffect("contrast", { amount: 0.5 }, [AMOUNT]),
  grayscale: defineEffect("grayscale", {}, [AMOUNT]),
  blur: defineEffect("blur", {}, [AMOUNT, SCALE]),
});

export function getEffectDefinition(type: EffectType): EffectDefinition {
  ensure(Object.hasOwn(EFFECT_CATALOG, type), "INVALID_COMMAND", "Effet inconnu");
  return EFFECT_CATALOG[type];
}

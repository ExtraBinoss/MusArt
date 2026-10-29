import type { Effect, EffectType } from "../../document/model";
import { EFFECT_CATALOG } from "../../effects/catalog";
import { EFFECT_COMPOSITE_MODES } from "../../effects/compositing";
import type { EffectParameter } from "../../effects/definition";
import { getEffectParameter } from "../../effects/parameters";
import { BLEND_MODES } from "../../layers/blending/catalog";
import type { EffectMotionCapability, EffectMotionProperty, MotionPropertySchema } from "./model";

const number = (min: number, max: number): MotionPropertySchema => ({
  kind: "number",
  min,
  max,
  interpolation: "continuous",
});
const choice = (options: readonly string[]): MotionPropertySchema => ({
  kind: "choice",
  options: Object.freeze([...options]),
  interpolation: "hold",
});
const common: Readonly<Record<EffectMotionProperty, MotionPropertySchema>> = Object.freeze({
  enabled: { kind: "boolean", interpolation: "hold" },
  amount: number(0, 1),
  scale: number(0.1, 128),
  levels: number(2, 256),
  color: { kind: "boolean", interpolation: "hold" },
  seed: { kind: "integer", min: 0, max: 2147483647, interpolation: "hold" },
  blendMode: choice(BLEND_MODES),
  opacity: number(0, 1),
  composite: choice(["default", ...EFFECT_COMPOSITE_MODES]),
  time: number(0, 86400),
});
export const EFFECT_MOTION_PROPERTIES: readonly EffectMotionProperty[] = Object.freeze(
  Object.keys(common) as EffectMotionProperty[],
);

/** Existing preset selection is a domain command which writes multiple parameters.
 * It must be expanded into real parameter edits/keys, not evaluated as a no-op scalar. */
const macroControls: Readonly<Partial<Record<EffectType, Readonly<Record<string, string>>>>> = {
  gradient: {
    preset:
      "Preset selection is a multi-parameter authoring macro; animate its generated parameters instead.",
  },
};

export function effectMotionCapabilityInventory(
  type: EffectType,
): readonly EffectMotionCapability[] {
  if (!Object.hasOwn(EFFECT_CATALOG, type)) return [];
  const definition = EFFECT_CATALOG[type];
  const capabilities: EffectMotionCapability[] = EFFECT_MOTION_PROPERTIES.map((property) => ({
    kind: "effect",
    property,
    status: "animatable",
  }));
  for (const parameter of definition.parameters) {
    if (parameter.scope !== "settings") continue;
    const reason = Object.hasOwn(macroControls[type] ?? {}, parameter.key)
      ? macroControls[type]![parameter.key]
      : undefined;
    capabilities.push({
      kind: "effectSetting",
      property: parameter.key,
      status: reason ? "macro" : "animatable",
      ...(reason ? { reason } : {}),
    });
  }
  return capabilities;
}

function parameterSchema(parameter: EffectParameter): MotionPropertySchema {
  if (parameter.kind === "number")
    return {
      kind: parameter.integer ? "integer" : "number",
      min: parameter.documentMin ?? parameter.min,
      max: parameter.documentMax ?? parameter.max,
      interpolation: parameter.integer ? "hold" : "continuous",
    };
  if (parameter.kind === "boolean") return { kind: "boolean", interpolation: "hold" };
  if (parameter.kind === "color")
    return { kind: "color", format: "rgb", interpolation: "continuous" };
  return choice(parameter.options.map((option) => option.value));
}

interface EffectBindings {
  readonly root: ReadonlyMap<string, MotionPropertySchema>;
  readonly settings: ReadonlyMap<string, EffectParameter>;
  readonly schemas: ReadonlyMap<string, MotionPropertySchema>;
}
/** One catalog pass at module initialization; no effect-type dispatch in animation code. */
const bindings: ReadonlyMap<EffectType, EffectBindings> = new Map(
  Object.values(EFFECT_CATALOG).map((definition) => {
    const root = new Map<string, MotionPropertySchema>(Object.entries(common));
    const settings = new Map<string, EffectParameter>();
    const schemas = new Map<string, MotionPropertySchema>();
    const excluded = new Set(
      effectMotionCapabilityInventory(definition.type)
        .filter((capability) => capability.status === "macro")
        .map((capability) => capability.property),
    );
    for (const parameter of definition.parameters) {
      if (parameter.scope === "settings") {
        if (excluded.has(parameter.key)) continue;
        settings.set(parameter.key, parameter);
        schemas.set(parameter.key, parameterSchema(parameter));
      } else if (parameter.key === "scale") {
        // The document validator follows each effect's declared legacy scale range.
        root.set(parameter.key, parameterSchema(parameter));
      }
    }
    return [definition.type, { root, settings, schemas }] as const;
  }),
);

export function effectMotionSchema(
  effect: Effect,
  property: string,
  setting: boolean,
): MotionPropertySchema | null {
  const metadata = bindings.get(effect.type);
  return (setting ? metadata?.schemas.get(property) : metadata?.root.get(property)) ?? null;
}

export function effectSettingProperties(effect: Effect): readonly string[] {
  return [...(bindings.get(effect.type)?.settings.keys() ?? [])];
}

export function readEffectMotionValue(effect: Effect, property: string, setting: boolean): unknown {
  const metadata = bindings.get(effect.type);
  if (!metadata) return undefined;
  if (setting) {
    const parameter = metadata.settings.get(property);
    return parameter ? getEffectParameter(effect, parameter) : undefined;
  }
  if (!metadata.root.has(property)) return undefined;
  if (property === "blendMode") return effect.blendMode ?? "normal";
  if (property === "opacity") return effect.opacity ?? 1;
  // Missing composite means effect replacement, distinct from Porter-Duff source-over.
  if (property === "composite") return effect.composite ?? "default";
  if (property === "time") return effect.time ?? 0;
  return effect[property as EffectMotionProperty];
}

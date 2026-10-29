import type { Composition, Layer } from "../../document/model";
import { ensure } from "../../errors";
import {
  EFFECT_MOTION_PROPERTIES,
  effectMotionSchema,
  effectSettingProperties,
  readEffectMotionValue,
} from "./effect";
import { LAYER_MOTION_PROPERTIES, layerMotionSchema, readLayerMotionValue } from "./layer";
import type { MotionPropertyDescriptor, MotionPropertyTarget, MotionValue } from "./model";
import { isValidMotionValue } from "./validation";
export { validateMotionValue } from "./validation";
export { effectMotionCapabilityInventory } from "./effect";
export { LAYER_MOTION_LIMITATIONS } from "./layer";

/** Layer-scoped lookup is useful to compiled evaluators which already indexed the scene tree. */
export function resolveLayerMotionProperty(
  layer: Layer,
  target: MotionPropertyTarget,
): MotionPropertyDescriptor | null {
  if (target.kind !== "layer" && target.kind !== "effect" && target.kind !== "effectSetting")
    return null;
  if (layer.id !== target.layerId) return null;
  const effect =
    target.kind === "layer" ? undefined : layer.effects.find((item) => item.id === target.effectId);
  const schema =
    target.kind === "layer"
      ? layerMotionSchema(layer, target.property)
      : effect && effectMotionSchema(effect, target.property, target.kind === "effectSetting");
  if (!schema) return null;
  const value =
    target.kind === "layer"
      ? readLayerMotionValue(layer, target.property)
      : readEffectMotionValue(effect!, target.property, target.kind === "effectSetting");
  if (!isValidMotionValue(schema, value)) return null;
  return { ...schema, target: { ...target }, value } as MotionPropertyDescriptor;
}

export function resolveMotionProperty(
  composition: Composition,
  target: MotionPropertyTarget,
): MotionPropertyDescriptor | null {
  const layer = composition.layers.find((item) => item.id === target.layerId);
  return layer ? resolveLayerMotionProperty(layer, target) : null;
}

export function readMotionValue(
  composition: Composition,
  target: MotionPropertyTarget,
): MotionValue {
  const descriptor = resolveMotionProperty(composition, target);
  ensure(descriptor, "INVALID_COMMAND", "Unknown or unavailable animation target.");
  return descriptor.value;
}

/** Includes conditional/dormant effect controls; visibility never deletes animation capability. */
export function listMotionProperties(composition: Composition): MotionPropertyDescriptor[] {
  const descriptors: MotionPropertyDescriptor[] = [];
  for (const layer of composition.layers) {
    const targets: MotionPropertyTarget[] = LAYER_MOTION_PROPERTIES.map((property) => ({
      kind: "layer",
      layerId: layer.id,
      property,
    }));
    for (const effect of layer.effects) {
      targets.push(
        ...EFFECT_MOTION_PROPERTIES.map((property): MotionPropertyTarget => ({
          kind: "effect",
          layerId: layer.id,
          effectId: effect.id,
          property,
        })),
      );
      targets.push(
        ...effectSettingProperties(effect).map((property): MotionPropertyTarget => ({
          kind: "effectSetting",
          layerId: layer.id,
          effectId: effect.id,
          property,
        })),
      );
    }
    for (const target of targets) {
      const descriptor = resolveLayerMotionProperty(layer, target);
      if (descriptor) descriptors.push(descriptor);
    }
  }
  return descriptors;
}

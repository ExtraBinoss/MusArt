import type { Layer } from "../../document/model";
import { ensure } from "../../errors";
import { resolveLayerMotionProperty } from "./registry";
import type { MotionPropertyTarget, MotionValue } from "./model";
import { validateMotionValue } from "./validation";

/** Pure frame-value application, not an authoring command or multi-property preset macro.
 * Callers compile/group tracks by layer; no composition traversal happens here. */
export function applyMotionValue(
  layer: Layer,
  target: MotionPropertyTarget,
  value: MotionValue,
): Layer {
  return applyMotionValues(layer, [{ target, value }]);
}

/** Apply one layer's values with a single owned layer/effect/settings draft.
 * Targets remain registry validated; no arbitrary path setter or per-effect dispatch. */
export function applyMotionValues(
  layer: Layer,
  values: readonly { readonly target: MotionPropertyTarget; readonly value: MotionValue }[],
): Layer {
  let result = layer;
  for (const { target, value } of values) {
    const descriptor = resolveLayerMotionProperty(result, target);
    ensure(descriptor, "INVALID_COMMAND", "Unknown or unavailable animation target.");
    validateMotionValue(descriptor, value);
    if (Object.is(descriptor.value, value)) continue;
    if (result === layer) result = { ...layer };
    if (target.kind === "layer") {
      if (target.property === "fillGradient.angle" || target.property === "fillGradient.kind") {
        if (result.fillGradient === layer.fillGradient)
          result.fillGradient = { ...layer.fillGradient! };
        if (target.property === "fillGradient.angle") result.fillGradient!.angle = value as number;
        else result.fillGradient!.kind = value as "linear" | "radial";
      } else Object.assign(result, { [target.property]: value });
      continue;
    }
    const index = layer.effects.findIndex((effect) => effect.id === target.effectId);
    const original = layer.effects[index]!;
    if (result.effects === layer.effects) result.effects = [...layer.effects];
    if (result.effects[index] === original) result.effects[index] = { ...original };
    const effect = result.effects[index]!;
    if (target.kind === "effectSetting") {
      if (effect.settings === original.settings) effect.settings = { ...original.settings };
      effect.settings![target.property] = value;
    } else if (target.property === "composite" && value === "default") delete effect.composite;
    else Object.assign(effect, { [target.property]: value });
  }
  return result;
}

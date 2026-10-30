import type { Composition } from "../../document/model";
import { cloneValue } from "../../document/immutable";
import { ensure } from "../../errors";
import type { MotionLayerTrack } from "../model";
import { motionTimeToSeconds } from "../time";
import { readMotionValue } from "../properties/registry";
import type { MotionAnimation, MotionAnimationPreset, AnimationChannel } from "./model";
import { animationTarget } from "./targets";

/** Freeze the visible instance settings into a fresh library recipe, independent of its project. */
export function captureMotionAnimationPreset(
  page: Composition,
  layerId: string,
  animation: MotionAnimation,
  name: string,
  id: string,
): MotionAnimationPreset {
  const preset = cloneValue(animation.preset);
  preset.id = id;
  preset.name = name;
  preset.duration = Math.max(1, Math.round(motionTimeToSeconds(animation.duration) * 1000));
  const layer = page.layers.find((layer) => layer.id === layerId);
  ensure(layer, "NOT_FOUND", "Animation subject is missing");
  for (const channel of preset.channels) {
    const base = readMotionValue(page, animationTarget(layerId, animation, channel.target));
    for (const point of channel.points) {
      if (typeof point.value !== "number" || typeof base !== "number") continue;
      const neutral =
        channel.operation === "add"
          ? 0
          : channel.operation === "multiply"
            ? 1
            : base / (channel.unit ? layer[channel.unit] : 1);
      point.value = neutral + (point.value - neutral) * animation.strength;
    }
  }
  validateMotionAnimationPreset(preset);
  return preset;
}
import { validateMotionAnimationPreset } from "./validation";

/** Export any authored property timeline as a self-contained, target-relative reusable recipe. */
export function extractMotionAnimationPreset(
  page: Composition,
  track: MotionLayerTrack,
  name: string,
  id: string,
): MotionAnimationPreset {
  const layer = page.layers.find((layer) => layer.id === track.layerId);
  ensure(layer, "NOT_FOUND", "Animation subject is missing");
  const properties = track.properties.filter((property) => property.keyframes.length >= 2);
  ensure(
    properties.length > 0,
    "INVALID_COMMAND",
    "Select a timeline containing at least two keyframes",
  );
  const first = Math.min(
    ...properties.map((property) => motionTimeToSeconds(property.keyframes[0]!.time)),
  );
  const last = Math.max(
    ...properties.map((property) =>
      motionTimeToSeconds(property.keyframes[property.keyframes.length - 1]!.time),
    ),
  );
  const slots = new Map<string, number>();
  const effects: MotionAnimationPreset["effects"] = [];
  const channels: AnimationChannel[] = properties.map((property) => {
    const target = property.target;
    let destination: AnimationChannel["target"];
    let operation: AnimationChannel["operation"] = "replace";
    let unit: AnimationChannel["unit"];
    const baseline = readMotionValue(page, target);
    if (target.kind === "layer") {
      destination = { kind: "layer", property: target.property };
      if (["x", "y", "rotation"].includes(target.property)) operation = "add";
      if (target.property === "scaleX" || target.property === "scaleY") operation = "multiply";
      if (target.property === "x") unit = "width";
      if (target.property === "y") unit = "height";
    } else {
      if (!slots.has(target.effectId)) {
        const original = layer.effects.find((effect) => effect.id === target.effectId)!;
        const { id: _id, ...definition } = cloneValue(original);
        slots.set(target.effectId, effects.length);
        effects.push(definition);
      }
      destination = {
        kind: target.kind,
        slot: slots.get(target.effectId)!,
        property: target.property,
      } as AnimationChannel["target"];
    }
    const points = property.keyframes.map((key) => ({
      at: (motionTimeToSeconds(key.time) - first) / (last - first),
      value:
        typeof key.value === "number" && typeof baseline === "number"
          ? operation === "add"
            ? (key.value - baseline) / (unit ? layer[unit] : 1)
            : operation === "multiply"
              ? key.value / baseline
              : key.value
          : key.value,
      ...(key.easing ? { easing: cloneValue(key.easing) } : {}),
    }));
    if (points[0]!.at > 0) points.unshift({ ...points[0]!, at: 0 });
    if (points[points.length - 1]!.at < 1) points.push({ ...points[points.length - 1]!, at: 1 });
    return { target: destination, operation, ...(unit ? { unit } : {}), points };
  });
  const preset: MotionAnimationPreset = {
    version: 1,
    id,
    name,
    category: "custom",
    duration: Math.max(1, Math.round((last - first) * 1000)),
    effects,
    channels,
  };
  validateMotionAnimationPreset(preset);
  return preset;
}

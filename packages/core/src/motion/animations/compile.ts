import type { Composition } from "../../document/model";
import { ensure } from "../../errors";
import { compileMotionInterpolator } from "../interpolation";
import { resolveMotionProperty } from "../properties/registry";
import type { MotionPropertyDescriptor, MotionValue } from "../properties/model";
import { addMotionTime, motionTimeProgress, type MotionTime } from "../time";
import type { MotionLayerTrack } from "../model";
import type { MotionFrameValue } from "../evaluate";
import { animationAddress, animationTarget } from "./targets";

export interface CompiledAnimationChannel {
  descriptor: MotionPropertyDescriptor;
  address: string;
  operation: "add" | "multiply" | "replace";
  strength: number;
  sample(time: MotionTime): MotionValue;
}

/** Retained samplers use the existing interpolation/easing implementation for preview and export. */
export function compileAnimations(
  page: Composition,
  track: MotionLayerTrack,
): CompiledAnimationChannel[] {
  const layer = page.layers.find((layer) => layer.id === track.layerId)!;
  return (track.animations ?? [])
    .filter((animation) => animation.enabled)
    .flatMap((animation) =>
      animation.preset.channels.map((channel) => {
        const target = animationTarget(layer.id, animation, channel.target);
        const descriptor = resolveMotionProperty(page, target);
        ensure(descriptor, "INVALID_DOCUMENT", "Animation target is missing");
        const multiplier = channel.unit ? layer[channel.unit] : 1;
        const points = channel.points.map((point) => ({
          ...point,
          value: typeof point.value === "number" ? point.value * multiplier : point.value,
        }));
        const interpolation =
          descriptor.kind === "number" || descriptor.kind === "integer"
            ? { ...descriptor, kind: "number" as const, min: -1e12, max: 1e12 }
            : descriptor;
        const segments = points
          .slice(1)
          .map((point, index) =>
            compileMotionInterpolator(
              interpolation,
              points[index]!.value,
              point.value,
              point.easing,
            ),
          );
        const end = addMotionTime(animation.start, animation.duration);
        return {
          descriptor,
          address: animationAddress(target),
          operation: channel.operation,
          strength: animation.strength,
          sample(time: MotionTime) {
            const progress = motionTimeProgress(time, animation.start, end);
            if (progress <= 0) return points[0]!.value;
            if (progress >= 1) return points[points.length - 1]!.value;
            let index = 1;
            while (index < points.length - 1 && points[index]!.at < progress) index++;
            const left = points[index - 1]!,
              right = points[index]!;
            return segments[index - 1]!((progress - left.at) / (right.at - left.at));
          },
        };
      }),
    );
}

/** Actions compose in authored order after ordinary keyframes; add/multiply are explicit. */
export function evaluateAnimations(
  channels: readonly CompiledAnimationChannel[],
  time: MotionTime,
  values: MotionFrameValue[],
  firstValue = 0,
): void {
  const indexes = new Map(
    values
      .slice(firstValue)
      .map((entry, index) => [animationAddress(entry.target), firstValue + index]),
  );
  for (const channel of channels) {
    const index = indexes.get(channel.address);
    const current = index === undefined ? channel.descriptor.value : values[index]!.value;
    const sampled = channel.sample(time);
    let value: MotionValue = sampled;
    if (typeof sampled === "number" && typeof current === "number") {
      if (channel.operation === "add") value = current + sampled * channel.strength;
      else if (channel.operation === "multiply")
        value = current * (1 + (sampled - 1) * channel.strength);
      else value = current + (sampled - current) * channel.strength;
      const descriptor = channel.descriptor;
      if (descriptor.kind === "number" || descriptor.kind === "integer")
        value = Math.max(
          descriptor.min,
          Math.min(descriptor.max, descriptor.kind === "integer" ? Math.round(value) : value),
        );
    }
    const entry = Object.freeze({ target: channel.descriptor.target, value });
    if (index === undefined) {
      indexes.set(channel.address, values.length);
      values.push(entry);
    } else values[index] = entry;
  }
}

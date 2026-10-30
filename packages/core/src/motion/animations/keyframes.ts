import type { Composition } from "../../document/model";
import { ensure } from "../../errors";
import type { MotionLayerTrack, MotionPropertyTrack } from "../model";
import {
  addMotionTime,
  compareMotionTime,
  motionTimeToSeconds,
  subtractMotionTime,
  type MotionTime,
} from "../time";
import type { MotionAnimation } from "./model";
import { animationTarget } from "./targets";

/** Presentation identities are derived from the captured revision and never persisted as tracks. */
export function animationPropertyId(animationId: string, channel: number): string {
  return JSON.stringify(["animation-channel", animationId, channel]);
}
export function animationPointId(animationId: string, channel: number, point: number): string {
  return JSON.stringify(["animation-point", animationId, channel, point]);
}
export function animationPointTime(animation: MotionAnimation, at: number): MotionTime {
  if (at === 0) return animation.start;
  if (at === 1) return addMotionTime(animation.start, animation.duration);
  return addMotionTime(animation.start, {
    value: Math.round(motionTimeToSeconds(animation.duration) * at * 1e9),
    rate: 1e9,
  });
}
export function projectAnimationProperties(track: MotionLayerTrack) {
  return (track.animations ?? []).flatMap((animation) =>
    animation.preset.channels.map((channel, channelIndex) => ({
      animation,
      channelIndex,
      property: {
        id: animationPropertyId(animation.id, channelIndex),
        target: animationTarget(track.layerId, animation, channel.target),
        keyframes: channel.points.map((point, index) => ({
          id: animationPointId(animation.id, channelIndex, index),
          time: animationPointTime(animation, point.at),
          value: point.value,
          ...(point.easing ? { easing: point.easing } : {}),
        })),
      } satisfies MotionPropertyTrack,
    })),
  );
}
export function projectMotionProperties(track: MotionLayerTrack): MotionPropertyTrack[] {
  return [...track.properties, ...projectAnimationProperties(track).map((entry) => entry.property)];
}

/** Capture selection once. Samples retain portable channel values and only change their local times. */
export function captureAnimationPointMove(page: Composition, ids: ReadonlySet<string>) {
  const found = new Set<string>();
  const entries = (page.motion?.tracks ?? []).flatMap((track) =>
    (track.animations ?? []).flatMap((animation) => {
      const selected = animation.preset.channels.map((channel, ci) =>
        channel.points.map((_, pi) => {
          const id = animationPointId(animation.id, ci, pi);
          if (!ids.has(id)) return false;
          found.add(id);
          return true;
        }),
      );
      return selected.some((points) => points.some(Boolean))
        ? [{ track, animation, selected }]
        : [];
    }),
  );
  function sample(delta: MotionTime): Map<string, MotionAnimation> {
    const result = new Map<string, MotionAnimation>();
    for (const { animation, selected } of entries) {
      const shiftStart = selected.some((points) => points[0]);
      const shiftEnd = selected.some((points) => points[points.length - 1]);
      const start = shiftStart ? addMotionTime(animation.start, delta) : animation.start;
      const originalEnd = addMotionTime(animation.start, animation.duration);
      const end = shiftEnd ? addMotionTime(originalEnd, delta) : originalEnd;
      ensure(
        start.value >= 0 && compareMotionTime(start, end) < 0,
        "INVALID_COMMAND",
        "Invalid animation interval",
      );
      const duration = subtractMotionTime(end, start);
      const channels = animation.preset.channels.map((channel, ci) => {
        let previous = start;
        const points = channel.points.map((point, pi) => {
          if (pi === 0 || pi === channel.points.length - 1) return point;
          const time = selected[ci]![pi]
            ? addMotionTime(animationPointTime(animation, point.at), delta)
            : animationPointTime(animation, point.at);
          ensure(
            compareMotionTime(previous, time) < 0 && compareMotionTime(time, end) < 0,
            "INVALID_COMMAND",
            "Animation points cannot cross",
          );
          previous = time;
          return {
            ...point,
            at:
              motionTimeToSeconds(subtractMotionTime(time, start)) / motionTimeToSeconds(duration),
          };
        });
        return { ...channel, points };
      });
      result.set(animation.id, {
        ...animation,
        start,
        duration,
        preset: { ...animation.preset, channels },
      });
    }
    return result;
  }
  return { found, entries, sample };
}

/** Endpoints define the block bounds; remove intermediate points or complete channels. */
export function removeAnimationPoints(page: Composition, ids: ReadonlySet<string>): number {
  let found = 0;
  for (const track of page.motion?.tracks ?? [])
    for (const animation of track.animations ?? []) {
      const channels = animation.preset.channels.flatMap((channel, ci) => {
        const selected = channel.points.map((_, pi) =>
          ids.has(animationPointId(animation.id, ci, pi)),
        );
        const count = selected.filter(Boolean).length;
        found += count;
        if (!count) return [channel];
        if (count === channel.points.length) return [];
        ensure(
          !selected[0] && !selected[selected.length - 1],
          "INVALID_COMMAND",
          "Animation endpoints define its interval",
        );
        return [{ ...channel, points: channel.points.filter((_, pi) => !selected[pi]) }];
      });
      ensure(
        channels.length > 0,
        "INVALID_COMMAND",
        "Delete the animation block to remove its last property",
      );
      animation.preset = { ...animation.preset, channels };
    }
  return found;
}

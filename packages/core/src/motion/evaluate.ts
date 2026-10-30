import { evaluateAnimations } from "./animations/compile";
import type { MotionProgram, CompiledMotionProperty, CompiledMotionLayer } from "./compile";
import type { MotionPropertyTarget, MotionValue } from "./properties/model";
import {
  addMotionTime,
  subtractMotionTime,
  compareMotionTime,
  motionTimeProgress,
  normalizeMotionTime,
  type MotionTime,
} from "./time";

export interface MotionFrameValue {
  readonly target: MotionPropertyTarget;
  readonly value: MotionValue;
}

export interface MotionFrameMediaRequest {
  readonly layerId: string;
  readonly assetId: string;
  /** Explicit source presentation time; firstTimestamp is added exactly once at compilation. */
  readonly sourceTime: MotionTime;
  readonly mute: boolean;
  readonly volume: number;
}

export interface MotionFramePlan {
  readonly compositionId: string;
  readonly mode: "static" | "motion";
  readonly time: MotionTime;
  /** Preview-only left-limit presence at the duration boundary; properties still sample exact time. */
  readonly terminalPreview: boolean;
  readonly values: readonly MotionFrameValue[];
  /** Temporal presence only. Ordinary visibility and mask-source paint rules remain in the renderer. */
  readonly activeLayerIds: readonly string[];
  readonly mediaRequests: readonly MotionFrameMediaRequest[];
}

export interface MotionEvaluationOptions {
  readonly terminalPreview?: boolean;
}

const issuedPlans = new WeakMap<MotionFramePlan, MotionProgram>();

/** Runtime plans belong to one frozen compilation, including across asynchronous adapters. */
export function isMotionFramePlanFor(program: MotionProgram, plan: MotionFramePlan): boolean {
  return issuedPlans.get(plan) === program;
}

function activeAt(
  layer: Pick<CompiledMotionLayer, "start" | "end">,
  time: MotionTime,
  terminal: boolean,
): boolean {
  const start = compareMotionTime(time, layer.start);
  const end = layer.end === null ? -1 : compareMotionTime(time, layer.end);
  return terminal ? start > 0 && end <= 0 : start >= 0 && end < 0;
}

function propertyValue(property: CompiledMotionProperty, time: MotionTime): MotionValue {
  const keys = property.keys;
  let low = 0;
  let high = keys.length;
  // Upper bound: the key at an equal rational timestamp is already in effect.
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compareMotionTime(keys[middle]!.time, time) <= 0) low = middle + 1;
    else high = middle;
  }
  if (low === 0) return keys[0]!.value;
  if (low === keys.length) return keys[low - 1]!.value;
  return property.segments[low - 1]!(
    motionTimeProgress(time, keys[low - 1]!.time, keys[low]!.time),
  );
}

/** Stateless sampling: only the supplied exact time and the frozen compiled program are read. */
export function evaluateMotion(
  program: MotionProgram,
  time: MotionTime,
  options: MotionEvaluationOptions = {},
): MotionFramePlan {
  const sampledTime = normalizeMotionTime(time);
  const terminalPreview =
    options.terminalPreview === true &&
    program.mode === "motion" &&
    program.duration !== null &&
    compareMotionTime(sampledTime, program.duration) === 0;
  const values: MotionFrameValue[] = [];
  const activeLayerIds: string[] = [];
  const activeIds = new Set<string>();
  const valuedIds = new Set<string>();
  const mediaRequests: MotionFrameMediaRequest[] = [];
  for (const layer of program.layers) {
    if (
      !activeIds.has(layer.id) &&
      (program.mode === "static" || activeAt(layer, sampledTime, terminalPreview))
    ) {
      activeIds.add(layer.id);
      activeLayerIds.push(layer.id);
      if (layer.media)
        mediaRequests.push(
          Object.freeze({
            layerId: layer.id,
            assetId: layer.media.assetId,
            sourceTime: Object.freeze(
              program.mode === "motion"
                ? addMotionTime(
                    layer.media.sourceStart,
                    subtractMotionTime(sampledTime, layer.media.timelineStart),
                  )
                : layer.media.sourceStart,
            ),
            mute: layer.media.mute,
            volume: layer.media.volume,
          }),
        );
    }
    if (
      valuedIds.has(layer.id) ||
      (layer.propertyScope && !activeAt(layer.propertyScope, sampledTime, terminalPreview))
    )
      continue;
    valuedIds.add(layer.id);
    const firstValue = values.length;
    for (const property of layer.properties)
      values.push(
        Object.freeze({ target: property.target, value: propertyValue(property, sampledTime) }),
      );
    if (layer.animations?.length)
      evaluateAnimations(layer.animations, sampledTime, values, firstValue);
    if (layer.geometrySources?.length) {
      const available = layer.geometrySources.filter(
        (source) =>
          source.enabled &&
          !values
            .slice(firstValue)
            .some(
              (value) =>
                value.target.kind === "effect" &&
                value.target.effectId === source.effectId &&
                value.target.property === "enabled" &&
                value.value === false,
            ),
      );
      const started = available.filter(
        (source) => compareMotionTime(sampledTime, source.start) >= 0,
      );
      const candidates = started.length ? started : available;
      const winner = candidates.reduce<(typeof candidates)[number] | undefined>(
        (best, source) =>
          !best ||
          (started.length
            ? compareMotionTime(source.start, best.start) >= 0
            : compareMotionTime(source.start, best.start) < 0)
            ? source
            : best,
        undefined,
      );
      for (const source of layer.geometrySources) {
        const entry: MotionFrameValue = Object.freeze({
          target: {
            kind: "effect" as const,
            layerId: layer.id,
            effectId: source.effectId,
            property: "enabled" as const,
          },
          value: source.effectId === winner?.effectId,
        });
        const index = values.findIndex(
          (value) =>
            value.target.kind === "effect" &&
            value.target.layerId === layer.id &&
            value.target.effectId === source.effectId &&
            value.target.property === "enabled",
        );
        if (index < 0) values.push(entry);
        else values[index] = entry;
      }
    }
  }
  const plan: MotionFramePlan = Object.freeze({
    compositionId: program.compositionId,
    mode: program.mode,
    time: Object.freeze(sampledTime),
    terminalPreview,
    values: Object.freeze(values),
    activeLayerIds: Object.freeze(activeLayerIds),
    mediaRequests: Object.freeze(mediaRequests),
  });
  issuedPlans.set(plan, program);
  return plan;
}

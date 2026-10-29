import type { MotionProgram, CompiledMotionProperty, CompiledMotionLayer } from "./compile";
import type { MotionPropertyTarget, MotionValue } from "./properties/model";
import {
  compareMotionTime,
  motionTimeProgress,
  normalizeMotionTime,
  type MotionTime,
} from "./time";

export interface MotionFrameValue {
  readonly target: MotionPropertyTarget;
  readonly value: MotionValue;
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
}

export interface MotionEvaluationOptions {
  readonly terminalPreview?: boolean;
}

const issuedPlans = new WeakMap<MotionFramePlan, MotionProgram>();

/** Runtime plans belong to one frozen compilation, including across asynchronous adapters. */
export function isMotionFramePlanFor(program: MotionProgram, plan: MotionFramePlan): boolean {
  return issuedPlans.get(plan) === program;
}

function activeAt(layer: CompiledMotionLayer, time: MotionTime, terminal: boolean): boolean {
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
  for (const layer of program.layers) {
    if (program.mode === "static" || activeAt(layer, sampledTime, terminalPreview))
      activeLayerIds.push(layer.id);
    for (const property of layer.properties)
      values.push(
        Object.freeze({ target: property.target, value: propertyValue(property, sampledTime) }),
      );
  }
  const plan: MotionFramePlan = Object.freeze({
    compositionId: program.compositionId,
    mode: program.mode,
    time: Object.freeze(sampledTime),
    terminalPreview,
    values: Object.freeze(values),
    activeLayerIds: Object.freeze(activeLayerIds),
  });
  issuedPlans.set(plan, program);
  return plan;
}

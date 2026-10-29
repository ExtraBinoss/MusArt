import type { Command, EnginePort, Layer } from "@musart/core";
import {
  captureMotionEdit,
  isMotionEditCurrent,
  motionLayerCommands,
  motionTimeChanges,
  type MotionEditOrigin,
} from "../../state/session/motion-edit";
import { isGestureOriginCurrent, type GestureOrigin } from "./gesture-origin";
import type { LayerPatch } from "./gestures";

export interface TransformAuthoring {
  origin: GestureOrigin;
  motionEdit?: MotionEditOrigin;
}

/** Bind the authored time and canonical document once; displayed geometry stays separate. */
export function captureTransformAuthoring(engine: EnginePort): Required<TransformAuthoring> {
  const motionEdit = captureMotionEdit(engine);
  const { project, pageId, revision } = motionEdit.snapshot;
  return { origin: { project, pageId, revision }, motionEdit };
}

export function isTransformAuthoringCurrent(
  engine: EnginePort,
  active: TransformAuthoring,
): boolean {
  return (
    isGestureOriginCurrent(engine, active.origin) &&
    (!active.motionEdit || isMotionEditCurrent(engine, active.motionEdit))
  );
}

/** Clock invalidation also applies when the evaluated artwork is on a constant plateau. */
export function watchTransformAuthoring(
  engine: EnginePort,
  read: () => TransformAuthoring | null,
  cancel: () => void,
): () => void {
  const update = () => {
    const active = read();
    if (active?.motionEdit && !isTransformAuthoringCurrent(engine, active)) cancel();
  };
  const stopDocument = engine.subscribe(update);
  const stopClock = motionTimeChanges(engine).subscribe(update);
  return () => {
    stopDocument();
    stopClock();
  };
}

/** One typed batch writes keys at the captured time and leaves unkeyed/static edits in the base. */
export function transformAuthoringCommands(
  engine: EnginePort,
  active: TransformAuthoring & { layers: readonly Layer[] },
  patches: readonly LayerPatch[],
): Command[] {
  if (!active.motionEdit || !isTransformAuthoringCurrent(engine, active)) return [];
  return patches.flatMap(({ layerId, patch }) => {
    const layer = active.layers.find((item) => item.id === layerId);
    if (!layer) return [];
    const changed: Partial<Layer> = {};
    for (const key of Object.keys(patch) as (keyof Layer)[]) {
      const value = patch[key],
        previous = layer[key];
      const same =
        typeof value === "number" && typeof previous === "number"
          ? Math.abs(value - previous) < 1e-9
          : Object.is(value, previous);
      if (!same) Object.assign(changed, { [key]: value });
    }
    return Object.keys(changed).length
      ? motionLayerCommands(engine, active.motionEdit!, [layerId], changed)
      : [];
  });
}

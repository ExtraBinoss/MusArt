import type { Composition } from "../document/model";
import { freezeValue } from "../document/immutable";
import { ensure } from "../errors";
import type { MotionProgram } from "./compile";
import type { MotionFramePlan, MotionFrameValue } from "./evaluate";
import { applyMotionValues } from "./properties/apply";
import { isMotionFramePlanFor } from "./evaluate";

/** Shared pure preview/export materialization. Unchanged layers retain their compiled identities. */
export function applyMotionFrame(program: MotionProgram, plan: MotionFramePlan): Composition {
  ensure(
    isMotionFramePlanFor(program, plan),
    "INVALID_COMMAND",
    "Motion frame belongs to a different composition or mode.",
  );
  const base = program.composition;
  if (program.mode === "static") return base;
  const active = new Set(plan.activeLayerIds);
  const values = new Map<string, MotionFrameValue[]>();
  for (const value of plan.values) {
    const grouped = values.get(value.target.layerId);
    if (grouped) grouped.push(value);
    else values.set(value.target.layerId, [value]);
  }
  let changed = false;
  const layers = base.layers.map((original) => {
    let layer = applyMotionValues(original, values.get(original.id) ?? []);
    // Mask sources keep their identity/graph. Their temporal absence also zeros mask coverage,
    // because the renderer's mask mapping includes visibility through the source's lineage.
    if (!active.has(original.id) && layer.visible) layer = { ...layer, visible: false };
    if (layer !== original) changed = true;
    return layer;
  });
  return changed ? freezeValue({ ...base, layers }) : base;
}

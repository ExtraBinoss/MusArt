import type { Composition, EnginePort } from "@musart/core";
import { layerSelection } from "./selection";
import { sameLayerContainer } from "../tree/activation";

interface Controls {
  engine: EnginePort;
  page: Composition;
  selection: readonly string[];
  run: (action: () => void) => void;
}

/** Global actions read their targets when invoked; only their visible availability belongs in React. */
export function sameSelectionAvailability(before: Controls, after: Controls) {
  if (
    before.engine !== after.engine ||
    !sameLayerContainer(before.page, after.page) ||
    before.run !== after.run ||
    before.selection.length !== after.selection.length
  )
    return false;
  const a = layerSelection(before.page, before.selection),
    b = layerSelection(after.page, after.selection);
  return (
    a.editable === b.editable &&
    a.ungroup === b.ungroup &&
    a.canGroup === b.canGroup &&
    a.canUngroup === b.canUngroup
  );
}

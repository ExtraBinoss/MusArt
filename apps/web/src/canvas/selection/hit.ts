import { createLayerGeometryIndex, type Composition } from "@musart/core";
import type { Point } from "../viewport/view";

/** Pointer selection can explain a locked foreground without granting an editing gesture. */
export function canvasHit(page: Composition, point: Point, includeLocked = false) {
  const index = createLayerGeometryIndex(page);
  const layer = index.hitTest(point, { includeLocked });
  return layer ? { layer, locked: index.isLocked(layer.id) } : null;
}

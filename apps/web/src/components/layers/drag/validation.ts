import { assertMotionHierarchyChange, createLayerGeometryIndex, type Composition, type Layer } from "@musart/core";
import { projectLayerDrop } from "./projection";
import { getDropCommand, type LayerDropPosition } from "../drop-target";

export type LayerDropRejection = "locked" | "cycle" | "animatedHierarchy" | "crossComposition" | "property";
/** The exact core hierarchy guard runs before showing a valid preview, and again on commit. */
export function validateLayerDrop(page: Composition, id: string, targetId: string, position: LayerDropPosition): { layers: Layer[] } | { reason: LayerDropRejection } {
  const geometry = createLayerGeometryIndex(page);
  const source = geometry.byId.get(id), target = geometry.byId.get(targetId);
  if (!source || !target) return { reason: "cycle" };
  if (geometry.isLocked(id) || geometry.isLocked(targetId)) return { reason: "locked" };
  const layers = projectLayerDrop(page.layers, id, targetId, position);
  if (!layers) return { reason: "cycle" };
  const command = getDropCommand(id, target, position, page.layers);
  if (command.type === "reorderLayer" && command.parentId !== source.parentId) {
    try { assertMotionHierarchyChange(page, [id, ...(command.parentId ? [command.parentId] : [])]); }
    catch { return { reason: "animatedHierarchy" }; }
  }
  return { layers };
}

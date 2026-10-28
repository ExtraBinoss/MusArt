import type { Layer } from "@musart/core";
export type LayerDropPosition = "before" | "after" | "inside" | "mask";
/** Edges insert in the visual stack; the center of a group receives children. */
export function getDropPosition(
  layer: Layer,
  clientY: number,
  bounds: { top: number; height: number },
  altKey: boolean,
): LayerDropPosition {
  if (altKey) return "mask";
  const fraction = bounds.height ? (clientY - bounds.top) / bounds.height : 0.5;
  if (layer.kind === "group" && fraction > 0.25 && fraction < 0.75) return "inside";
  return fraction < 0.5 ? "before" : "after";
}
export function getDropCommand(
  id: string,
  layer: Layer,
  position: LayerDropPosition,
  layers: Layer[],
) {
  if (position === "mask")
    return { type: "attachLayerMask" as const, sourceId: id, targetId: layer.id };
  const remaining = layers.filter((item) => item.id !== id);
  const insertion =
    position === "inside"
      ? remaining.length
      : remaining.indexOf(layer) + (position === "before" ? 1 : 0);
  return {
    type: "reorderLayer" as const,
    id,
    index: Math.max(0, Math.min(layers.length - 1, insertion)),
    parentId: position === "inside" ? layer.id : layer.parentId,
  };
}

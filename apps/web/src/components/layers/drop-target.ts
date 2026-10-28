import type { Layer } from "@musart/core";
export type LayerDropPosition = "before" | "after" | "inside" | "mask";
/** Edges insert in the visual stack; the center of a group receives children. */
export function getDropPosition(
  layer: Layer,
  clientY: number,
  bounds: { top: number; height: number },
  altKey: boolean,
  pointer?: {
    clientX: number;
    thumbnail?: { left: number; top: number; width: number; height: number };
  },
): LayerDropPosition {
  if (altKey) return "mask";
  const thumbnail = pointer?.thumbnail;
  if (
    pointer &&
    thumbnail &&
    thumbnail.width > 0 &&
    thumbnail.height > 0 &&
    pointer.clientX >= thumbnail.left - 3 &&
    pointer.clientX <= thumbnail.left + thumbnail.width + 3 &&
    clientY >= Math.max(bounds.top + 4, thumbnail.top) &&
    clientY <= Math.min(bounds.top + bounds.height - 4, thumbnail.top + thumbnail.height)
  )
    return "mask";
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

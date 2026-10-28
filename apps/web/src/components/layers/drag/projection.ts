import type { Layer } from "@musart/core";
import { getDropCommand, type LayerDropPosition } from "../drop-target";

function editable(id: string, layers: ReadonlyMap<string, Layer>): boolean {
  const visited = new Set<string>();
  let current = layers.get(id);
  while (current) {
    if (current.locked || visited.has(current.id)) return false;
    visited.add(current.id);
    current = current.parentId ? layers.get(current.parentId) : undefined;
  }
  return true;
}
/** Reparenting and masks share one dependency graph; previews must reject both kinds of cycle. */
function acyclic(layers: readonly Layer[]): boolean {
  const graph = new Map(layers.map((layer) => [layer.id, [] as string[]]));
  for (const layer of layers) {
    if (layer.parentId) graph.get(layer.parentId)?.push(layer.id);
    if (layer.mask?.layerId) graph.get(layer.id)?.push(layer.mask.layerId);
  }
  const done = new Set<string>(),
    visiting = new Set<string>();
  function visit(id: string, depth: number): boolean {
    if (visiting.has(id) || depth > 128) return false;
    if (done.has(id)) return true;
    visiting.add(id);
    if (!(graph.get(id) ?? []).every((child) => visit(child, depth + 1))) return false;
    visiting.delete(id);
    done.add(id);
    return true;
  }
  return layers.every((layer) => visit(layer.id, 0));
}
/** Visual copies only. Canonical transforms and the undo journal are untouched until drop. */
export function projectLayerDrop(
  layers: readonly Layer[],
  sourceId: string,
  targetId: string,
  position: LayerDropPosition,
): Layer[] | null {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const source = byId.get(sourceId),
    target = byId.get(targetId);
  if (
    !source ||
    !target ||
    source === target ||
    !editable(sourceId, byId) ||
    !editable(targetId, byId)
  )
    return null;
  if (position === "inside" && target.kind !== "group") return null;
  if (position === "mask") {
    const next = layers.map((layer) =>
      layer.id === targetId
        ? {
            ...layer,
            mask: { layerId: sourceId, mode: "alpha" as const, enabled: true, inverted: false },
          }
        : layer,
    );
    return acyclic(next) ? [...layers] : null;
  }
  const command = getDropCommand(sourceId, target, position, [...layers]);
  if (command.type !== "reorderLayer") return null;
  const next = layers.filter((layer) => layer.id !== sourceId);
  next.splice(command.index, 0, { ...source, parentId: command.parentId });
  return acyclic(next) ? next : null;
}

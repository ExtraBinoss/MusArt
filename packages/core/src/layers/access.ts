import { ensure } from "../errors";
import { getAncestors, getDescendants } from "./geometry";
import type { Composition, Layer } from "../document/model";
export function getLayer(page: Composition, id: string): Layer {
  const layer = page.layers.find((item) => item.id === id);
  ensure(layer, "NOT_FOUND", `Calque introuvable : ${id}`);
  return layer;
}
export function assertEditable(page: Composition, layer: Layer, allowOwnLock = false): void {
  ensure(
    (allowOwnLock || !layer.locked) &&
      !getAncestors(page, layer.id).some((parent) => parent.locked),
    "LOCKED",
    "Ce calque ou son groupe est verrouillé",
  );
}
export function selectedRoots(page: Composition, ids: string[]): Layer[] {
  const selected = new Set(ids);
  return [...selected]
    .map((id) => getLayer(page, id))
    .filter((layer) => !getAncestors(page, layer.id).some((parent) => selected.has(parent.id)));
}
export function deleteLayerTree(page: Composition, ids: string[]): void {
  const targets = getDescendants(page, ids);
  for (const id of ids) assertEditable(page, getLayer(page, id));
  for (const layer of targets) assertEditable(page, layer);
  const removed = new Set(targets.map((layer) => layer.id));
  page.layers = page.layers.filter((layer) => !removed.has(layer.id));
  for (const layer of page.layers)
    if (layer.mask?.layerId && removed.has(layer.mask.layerId)) {
      assertEditable(page, layer);
      layer.mask = null;
    }
  releaseUnusedMaskSources(page);
}
export function releaseUnusedMaskSources(page: Composition): void {
  const used = new Set(
    page.layers.flatMap((layer) => (layer.mask?.layerId ? [layer.mask.layerId] : [])),
  );
  for (const layer of page.layers)
    if (layer.maskSource && !used.has(layer.id)) layer.maskSource = false;
}

import { createLayerGeometryIndex, type Composition } from "@musart/core";
/** Immutable documents share the geometry index; all selection predicates are linear in selected rows. */
export function layerSelection(page: Composition, selection: readonly string[]) {
  const ids = new Set(selection),
    index = createLayerGeometryIndex(page);
  const selected = selection.map((id) => index.byId.get(id)).filter((layer) => layer !== undefined);
  // Memoize ancestor membership once rather than rebuilding every ancestor chain
  // when a deep group hierarchy is selected in its entirety.
  const covered = new Map<string, boolean>();
  function hasSelectedAncestor(id: string): boolean {
    const pending: string[] = [];
    let current: string | null = index.get(id).parentId;
    while (current && !ids.has(current) && !covered.has(current)) {
      pending.push(current);
      current = index.get(current).parentId;
    }
    const result = current !== null && (ids.has(current) || covered.get(current) === true);
    for (const item of pending) covered.set(item, result);
    return result;
  }
  const roots = selected.filter((layer) => !hasSelectedAncestor(layer.id));
  const editable = selected.length > 0 && selected.every((layer) => !index.isLocked(layer.id));
  const ungroup = roots.length > 0 && roots.every((layer) => layer.kind === "group");
  return {
    selected,
    roots,
    editable,
    ungroup,
    canGroup:
      editable && roots.length > 1 && roots.every((layer) => layer.parentId === roots[0]!.parentId),
    canUngroup:
      editable &&
      ungroup &&
      roots.every(
        (layer) =>
          !layer.effects.length &&
          !layer.mask &&
          layer.opacity === 1 &&
          layer.blendMode === "normal",
      ),
  };
}

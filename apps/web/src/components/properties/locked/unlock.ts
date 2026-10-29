import {
  createLayerGeometryIndex,
  type Composition,
  type EnginePort,
  type Layer,
} from "@musart/core";

/** Only authored locks on the target paths, ordered so core validation can unlock outer parents first. */
export function blockingLocks(page: Composition, ids: readonly string[]): Layer[] {
  const byId = createLayerGeometryIndex(page).byId;
  const seen = new Set<string>(),
    locks: Layer[] = [];
  for (const id of ids) {
    const path: Layer[] = [];
    let current = byId.get(id);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.push(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    for (const layer of path.reverse()) if (layer.locked) locks.push(layer);
  }
  return locks;
}

/** A deferred UI action cannot unlock a replacement document or a different selection. */
export function captureUnlock(engine: EnginePort, page: Composition, ids: readonly string[]) {
  const origin = engine.getSnapshot(),
    selected = new Set(origin.selection);
  const locks = blockingLocks(page, ids);
  return (): boolean => {
    const current = engine.getSnapshot();
    if (
      current.project !== origin.project ||
      current.revision !== origin.revision ||
      current.pageId !== page.id ||
      origin.pageId !== page.id ||
      current.project.pages.find((item) => item.id === page.id) !== page ||
      current.selection.length !== selected.size ||
      !current.selection.every((id) => selected.has(id)) ||
      !ids.every((id) => selected.has(id)) ||
      !locks.length
    )
      return false;
    engine.transaction(
      locks.map((layer) => ({
        type: "updateLayers",
        ids: [layer.id],
        patch: { locked: false },
      })),
    );
    return true;
  };
}

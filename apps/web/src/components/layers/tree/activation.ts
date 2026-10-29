import type { Composition, EnginePort } from "@musart/core";
import { useCallback, useSyncExternalStore } from "react";

/** Metadata may change independently; only an identical immutable layer array preserves row owners. */
export function sameLayerContainer(before: Composition, after: Composition): boolean {
  return (
    before.id === after.id &&
    (before === after ||
      (before.layers === after.layers &&
        Object.isFrozen(before) &&
        Object.isFrozen(after) &&
        Object.isFrozen(before.layers)))
  );
}

/** Resolve retained UI against the canonical document; loads and layer edits replace the array. */
export function resolveLayerPage(engine: EnginePort, page: Composition): Composition | null {
  const current = engine.getSnapshot().project.pages.find((item) => item.id === page.id);
  return current && sameLayerContainer(page, current) ? current : null;
}

/** Closed cards have no document subscription. An open editor follows metadata without stale drafts. */
export function useOpenLayerPage(engine: EnginePort, page: Composition, open: boolean) {
  const subscribe = useCallback(
    (listener: () => void) => (open ? engine.subscribe(listener) : () => {}),
    [engine, open],
  );
  const read = useCallback(
    () => (open ? resolveLayerPage(engine, page) : page),
    [engine, page, open],
  );
  return useSyncExternalStore(subscribe, read, read);
}

/** Inactive project rows can activate their real artboard, never a stale replacement. */
export function activateLayerPage(engine: EnginePort, page: Composition): boolean {
  const origin = resolveLayerPage(engine, page);
  if (!origin) return false;
  engine.setPage(page.id);
  const current = engine.getSnapshot();
  return current.pageId === page.id && resolveLayerPage(engine, origin) !== null;
}

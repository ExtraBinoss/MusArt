import { useMemo, useSyncExternalStore } from "react";
import type { EnginePort, SessionSnapshot } from "@musart/core";

/** The external-store projection owns its cache outside React render closures. */
function createDocumentReader(engine: EnginePort, includeSelection: boolean) {
  let previous: SessionSnapshot | undefined;
  return () => {
    const current = engine.getSnapshot();
    if (
      previous?.project === current.project &&
      previous.pageId === current.pageId &&
      previous.revision === current.revision &&
      (!includeSelection || previous.selection === current.selection)
    )
      return previous;
    previous = current;
    return current;
  };
}

/** Document consumers need no new React snapshot for presentation-only layer selection. */
export function useDocumentSnapshot(engine: EnginePort, includeSelection = false) {
  const read = useMemo(
    () => createDocumentReader(engine, includeSelection),
    [engine, includeSelection],
  );
  return useSyncExternalStore(engine.subscribe, read, read);
}

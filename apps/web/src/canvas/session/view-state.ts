import type { EnginePort, SessionSnapshot } from "@musart/core";
import { sameCanvasGeometry } from "./geometry-equality";
const sameSelection = (a: readonly string[], b: readonly string[]) =>
  a === b || (a.length === b.length && a.every((id, index) => id === b[index]));
/** Geometry/selection subscription: paint changes are delivered directly to SceneController. */
export function createCanvasView(engine: EnginePort) {
  let cached: SessionSnapshot | null = null;
  let observed: SessionSnapshot | null = null;
  return {
    subscribe: (listener: () => void) => engine.subscribe(listener),
    read: (): SessionSnapshot => {
      const snapshot = engine.getSnapshot();
      if (observed === snapshot && cached) return cached;
      const previous = observed;
      observed = snapshot;
      if (cached && previous?.project === snapshot.project && previous.pageId === snapshot.pageId) {
        if (!sameSelection(cached.selection, snapshot.selection)) cached = snapshot;
        return cached;
      }
      if (
        !cached ||
        !sameCanvasGeometry(cached, snapshot) ||
        !sameSelection(cached.selection, snapshot.selection)
      ) {
        cached = snapshot;
      }
      return cached;
    },
  };
}

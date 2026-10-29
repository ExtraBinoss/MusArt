import type { EnginePort, SessionSnapshot } from "@musart/core";
import { sameCanvasGeometry } from "./geometry-equality";
/** Geometry subscription only: paint and selection have their own retained consumers. */
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
        return cached;
      }
      if (!cached || !sameCanvasGeometry(cached, snapshot)) {
        cached = snapshot;
      }
      return cached;
    },
  };
}

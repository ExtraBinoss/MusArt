import type { EnginePort, SessionSnapshot } from "@musart/core";
const sameSelection = (a: readonly string[], b: readonly string[]) =>
  a === b || (a.length === b.length && a.every((id, index) => id === b[index]));
/** Geometry/selection subscription: paint changes are delivered directly to SceneController. */
export function createCanvasView(engine: EnginePort) {
  let cached: SessionSnapshot | null = null;
  let observed: SessionSnapshot | null = null;
  let signature = "";
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
      const page =
        snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
        snapshot.project.pages[0]!;
      const next = JSON.stringify([
        snapshot.project.id,
        snapshot.project.pages.map((item) => [item.id, item.name, item.width, item.height]),
        snapshot.pageId,
        page.name,
        page.width,
        page.height,
        page.guides,
        page.rulers,
        page.margins,
        page.layers.map((layer) => [
          layer.id,
          layer.kind,
          layer.name,
          layer.parentId,
          layer.x,
          layer.y,
          layer.width,
          layer.height,
          layer.rotation,
          layer.visible,
          layer.locked,
          layer.margin,
          layer.padding,
          layer.guides,
          layer.maskSource,
        ]),
      ]);
      if (!cached || signature !== next || !sameSelection(cached.selection, snapshot.selection)) {
        cached = snapshot;
        signature = next;
      }
      return cached;
    },
  };
}

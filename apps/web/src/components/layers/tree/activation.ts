import type { Composition, EnginePort } from "@musart/core";

/** Inactive project rows can activate their real artboard, never a stale replacement. */
export function activateLayerPage(engine: EnginePort, page: Composition): boolean {
  const snapshot = engine.getSnapshot();
  if (snapshot.project.pages.find((item) => item.id === page.id) !== page) return false;
  engine.setPage(page.id);
  const current = engine.getSnapshot();
  return (
    current.pageId === page.id && current.project.pages.find((item) => item.id === page.id) === page
  );
}

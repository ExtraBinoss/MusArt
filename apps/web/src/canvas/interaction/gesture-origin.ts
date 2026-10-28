import type { EnginePort, Project } from "@musart/core";

export interface GestureOrigin {
  project: Project;
  pageId: string;
  revision: number;
}
export function captureGestureOrigin(engine: EnginePort): GestureOrigin {
  const { project, pageId, revision } = engine.getSnapshot();
  return { project, pageId, revision };
}
export function isGestureOriginCurrent(engine: EnginePort, origin: GestureOrigin): boolean {
  const snapshot = engine.getSnapshot();
  return (
    snapshot.project === origin.project &&
    snapshot.pageId === origin.pageId &&
    snapshot.revision === origin.revision
  );
}

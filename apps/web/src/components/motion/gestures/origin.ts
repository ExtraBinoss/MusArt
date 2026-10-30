import type { Composition, Project, SessionSnapshot } from "@musart/core";

export interface TimelineGestureOrigin {
  readonly project: Project;
  readonly revision: number;
  readonly page: Pick<Composition, "id">;
  readonly installedLayers: readonly string[];
}

/** Selection is a session lease too: a later authoritative selection must never be restored away. */
export function isTimelineGestureCurrent(snapshot: SessionSnapshot, origin: TimelineGestureOrigin) {
  return (
    snapshot.project === origin.project &&
    snapshot.revision === origin.revision &&
    snapshot.pageId === origin.page.id &&
    snapshot.selection === origin.installedLayers
  );
}

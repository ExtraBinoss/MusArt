import { createLayerGeometryIndex, type EnginePort, type Project } from "@musart/core";
export interface LayerRenameOrigin {
  project: Project;
  revision: number;
  compositionId: string;
  layerId: string;
  name: string;
}
export function captureLayerRename(
  engine: EnginePort,
  compositionId: string,
  layerId: string,
): LayerRenameOrigin | null {
  const snapshot = engine.getSnapshot();
  const page = snapshot.project.pages.find((item) => item.id === compositionId);
  const layer = page?.layers.find((item) => item.id === layerId);
  if (
    snapshot.pageId !== compositionId ||
    !page ||
    !layer ||
    createLayerGeometryIndex(page).isLocked(layerId)
  )
    return null;
  return {
    project: snapshot.project,
    revision: snapshot.revision,
    compositionId,
    layerId,
    name: layer.name,
  };
}
export function commitLayerRename(
  engine: EnginePort,
  origin: LayerRenameOrigin,
  draft: string,
): "applied" | "unchanged" | "changed" | "failed" {
  const snapshot = engine.getSnapshot(),
    name = draft.trim();
  if (
    snapshot.project !== origin.project ||
    snapshot.revision !== origin.revision ||
    snapshot.pageId !== origin.compositionId
  )
    return "changed";
  if (!name || name === origin.name) return "unchanged";
  try {
    engine.execute({ type: "updateLayers", ids: [origin.layerId], patch: { name } });
    return "applied";
  } catch {
    return "failed";
  }
}

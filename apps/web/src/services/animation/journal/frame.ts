import {
  sameAssetOriginal,
  stateFromProject,
  type Asset,
  type SessionSnapshot,
} from "@musart/core";
import { snapshotProject } from "../../projects/writes/snapshot";
import type { JournalFrame } from "./model";

/** Metadata is always current; unchanged originals never enter a commit message. */
export function captureJournalFrame(
  snapshot: SessionSnapshot,
  previousAssets?: Record<string, Asset>,
): JournalFrame {
  const project = snapshotProject(snapshot.project);
  const assets = Object.values(project.assets);
  return {
    state: stateFromProject(project),
    descriptions: assets.map(({ dataUrl: _dataUrl, ...description }) => description),
    assets: assets.filter(
      (asset) => !previousAssets || !sameAssetOriginal(previousAssets[asset.id], asset),
    ),
    pageId: snapshot.pageId,
    revision: snapshot.revision,
  };
}

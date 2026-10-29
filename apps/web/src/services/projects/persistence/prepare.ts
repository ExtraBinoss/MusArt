import { isVideoAsset, type Project } from "@musart/core";
import type { ProjectWriteFrame } from "./model";
import { THUMBNAIL_RENDER_VERSION } from "../thumbnails/model";
export interface AssetBasis {
  projectId: string;
  revision: string;
  urls: Map<string, string>;
}
/** Shallow metadata capture only; the caller already owns the immutable project snapshot. */
export function prepareProjectWrite(
  project: Project,
  pageRevisions: Record<string, string>,
  pagePayloads: (number | undefined)[],
  options: { remember?: boolean; requireAbsent?: boolean; expectedRevision: string },
  thumbnail?: string,
  basis?: AssetBasis,
) {
  const { assets, ...document } = project,
    urls = new Map<string, string>();
  const matching = basis?.projectId === project.id ? basis : undefined;
  const descriptions = [],
    originals = [];
  for (const asset of Object.values(assets)) {
    if (isVideoAsset(asset)) {
      descriptions.push(asset);
      continue;
    }
    const { dataUrl, ...description } = asset;
    descriptions.push(description);
    urls.set(asset.id, dataUrl);
    if (!matching || matching.urls.get(asset.id) !== dataUrl)
      originals.push({ projectId: project.id, assetId: asset.id, dataUrl });
  }
  const frame: ProjectWriteFrame = {
    document,
    descriptions,
    originals,
    pageRevisions,
    thumbnailRenderVersion: THUMBNAIL_RENDER_VERSION,
    expectedRevision: options.expectedRevision,
    requireAbsent: options.requireAbsent ?? false,
    remember: options.remember !== false,
    ...(matching ? { basis: matching.revision } : {}),
    ...(thumbnail === undefined ? {} : { thumbnail }),
    ...(pagePayloads.length === project.pages.length &&
    pagePayloads.every((size): size is number => size !== undefined)
      ? { pagePayloads: pagePayloads as number[] }
      : {}),
  };
  return { frame, urls };
}
export function withFullOriginals(frame: ProjectWriteFrame, project: Project): ProjectWriteFrame {
  const { basis: _basis, ...rest } = frame;
  return {
    ...rest,
    originals: Object.values(project.assets)
      .filter((asset) => !isVideoAsset(asset))
      .map((asset) => ({
        projectId: project.id,
        assetId: asset.id,
        dataUrl: asset.dataUrl,
      })),
  };
}

import type { Asset, Composition, Project } from "@musart/core";
export interface StoredThumbnail {
  projectId: string;
  pageId: string;
  revision: string;
  blob: Blob;
  width: number;
  height: number;
  updatedAt: string;
}
export type ThumbnailInfo = Omit<StoredThumbnail, "blob"> & { bytes: number };
/** Read-only status belongs to a lease, never to a persisted thumbnail record. */
export type ThumbnailRead = StoredThumbnail & { stale?: boolean };
export interface ThumbnailStore {
  thumbnailInfo(projectId: string): Promise<ThumbnailInfo[]>;
  thumbnails(
    projectId: string,
    pageIds?: readonly string[],
    allowStale?: boolean,
  ): Promise<ThumbnailRead[]>;
  saveThumbnail(record: StoredThumbnail): Promise<boolean>;
  load(projectId: string, options?: { observe?: boolean }): Promise<Project>;
  thumbnailRevision?(page: Composition, assets: Record<string, Asset>): Promise<string>;
}
export interface ThumbnailView {
  pageId: string;
  revision: string;
  url: string;
  width: number;
  height: number;
  stale?: boolean;
}
export interface ThumbnailLease {
  items: ThumbnailView[];
  release: () => void;
}
export const THUMBNAIL_EDGE = 768;
export const THUMBNAIL_RENDER_VERSION = "gpu-webp-768-88-v4";
export const THUMBNAIL_QUALITY = 0.88;
export const MAX_THUMBNAIL_BYTES = 1024 * 1024;

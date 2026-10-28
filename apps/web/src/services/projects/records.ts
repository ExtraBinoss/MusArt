import type { ProjectSummary } from "../../state/contracts";
import type { StoredProject, StoredThumbnail, ThumbnailInfo } from "./database";
import { logicalBytes } from "./logical-bytes";
export function thumbnailInfo(record: StoredThumbnail): ThumbnailInfo {
  const { blob: _blob, ...info } = record;
  return { ...info, bytes: record.blob.size };
}
export function thumbnailBytes(record: StoredThumbnail): number {
  const { bytes: _cache, ...info } = thumbnailInfo(record);
  return logicalBytes(info) + record.blob.size;
}
export function legacyThumbnailBytes(thumbnail?: string): number {
  return thumbnail ? logicalBytes({ thumbnail }) : 0;
}
export function manifestBytes(record: StoredProject): number {
  const { bytes: _cache, thumbnail: _legacy, ...payload } = record;
  const pageBytes = record.bytes?.pagePayloads;
  if (
    pageBytes &&
    pageBytes.length === record.project.pages.length &&
    pageBytes.every((bytes) => Number.isSafeInteger(bytes) && bytes >= 2)
  ) {
    // Metadata may change inside an IDB transaction; page bodies remain the same immutable DTOs.
    const { pages: _pages, ...project } = record.project;
    const total =
      logicalBytes({ ...payload, project: { ...project, pages: [] } }) +
      pageBytes.reduce((sum, bytes) => sum + bytes, 0) +
      Math.max(0, pageBytes.length - 1);
    if (Number.isSafeInteger(total)) return total;
  }
  return logicalBytes(payload);
}
export function projectSummary(record: StoredProject): ProjectSummary {
  const { project, thumbnail } = record;
  return {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    width: project.pages[0]!.width,
    height: project.pages[0]!.height,
    pages: project.pages.map((page) => ({
      id: page.id,
      name: page.name,
      width: page.width,
      height: page.height,
      ...(record.pageRevisions?.[page.id]
        ? { thumbnailRevision: record.pageRevisions[page.id] }
        : {}),
      ...(record.thumbnailInfo?.find((info) => info.pageId === page.id)
        ? { thumbnailBytes: record.thumbnailInfo.find((info) => info.pageId === page.id)!.bytes }
        : {}),
    })),
    ...(thumbnail ? { thumbnail } : {}),
  };
}

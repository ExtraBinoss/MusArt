import type { IDBPDatabase } from "idb";
import type { StudioDatabase, ThumbnailInfo } from "../database";
import type { ThumbnailRead } from "../thumbnails/model";

/** Read full manifests only in the persistence owner; return small headers to preview scheduling. */
export async function readThumbnailInfo(
  db: IDBPDatabase<StudioDatabase>,
  projectId: string,
): Promise<ThumbnailInfo[]> {
  return (await db.get("projects", projectId))?.thumbnailInfo ?? [];
}

/** A single read transaction checks pixel revisions without sending the document back to the UI. */
export async function readThumbnails(
  db: IDBPDatabase<StudioDatabase>,
  projectId: string,
  pageIds?: readonly string[],
  allowStale = false,
): Promise<ThumbnailRead[]> {
  if (typeof allowStale !== "boolean") throw Error("Invalid thumbnail stale option.");
  if (pageIds && (!Array.isArray(pageIds) || pageIds.length > 100))
    throw Error("Invalid thumbnail page selection.");
  const tx = db.transaction(["projects", "thumbnails"]);
  const project = await tx.objectStore("projects").get(projectId);
  if (!project) {
    await tx.done;
    return [];
  }
  const records = pageIds
    ? await Promise.all(
        [...new Set(pageIds)].map((pageId) =>
          tx.objectStore("thumbnails").get([projectId, pageId]),
        ),
      )
    : await tx.objectStore("thumbnails").index("by-project").getAll(projectId);
  await tx.done;
  const pages = new Set(project.project.pages.map((page) => page.id));
  return records.flatMap((record): ThumbnailRead[] => {
    if (!record || !pages.has(record.pageId)) return [];
    const stale = record.revision !== project.pageRevisions?.[record.pageId];
    return stale ? (allowStale ? [{ ...record, stale: true }] : []) : [record];
  });
}

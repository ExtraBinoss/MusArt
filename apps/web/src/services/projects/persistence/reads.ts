import type { IDBPDatabase } from "idb";
import type { StudioDatabase, StoredThumbnail, ThumbnailInfo } from "../database";

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
): Promise<StoredThumbnail[]> {
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
  return records.filter(
    (record): record is StoredThumbnail =>
      record !== undefined && record.revision === project.pageRevisions?.[record.pageId],
  );
}

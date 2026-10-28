import type { IDBPDatabase } from "idb";
import type { StudioDatabase, StoredThumbnail } from "../database";
import { manifestBytes, thumbnailBytes, thumbnailInfo } from "../records";
export function validateThumbnail(thumbnail: StoredThumbnail): void {
  if (
    !(thumbnail.blob instanceof Blob) ||
    Object.hasOwn(thumbnail, "stale") ||
    thumbnail.blob.size > 1024 * 1024 ||
    !Number.isInteger(thumbnail.width) ||
    !Number.isInteger(thumbnail.height) ||
    thumbnail.width < 1 ||
    thumbnail.height < 1 ||
    thumbnail.width > 768 ||
    thumbnail.height > 768
  )
    throw Error("Invalid thumbnail.");
}
/** Merge only into the current pixel revision; stale background work cannot recreate a project. */
export async function persistThumbnail(
  db: IDBPDatabase<StudioDatabase>,
  thumbnail: StoredThumbnail,
): Promise<boolean> {
  validateThumbnail(thumbnail);
  const tx = db.transaction(["projects", "thumbnails"], "readwrite"),
    done = tx.done;
  try {
    const project = await tx.objectStore("projects").get(thumbnail.projectId);
    if (!project || project.pageRevisions?.[thumbnail.pageId] !== thumbnail.revision) {
      await done;
      return false;
    }
    const previous = await tx
      .objectStore("thumbnails")
      .get([thumbnail.projectId, thumbnail.pageId]);
    await tx.objectStore("thumbnails").put(thumbnail);
    project.thumbnailInfo = [
      ...(project.thumbnailInfo ?? []).filter((info) => info.pageId !== thumbnail.pageId),
      thumbnailInfo(thumbnail),
    ];
    if (project.bytes) {
      project.bytes.thumbnails +=
        thumbnailBytes(thumbnail) - (previous ? thumbnailBytes(previous) : 0);
      project.bytes.manifest = manifestBytes(project);
    }
    await tx.objectStore("projects").put(project);
    await done;
    return true;
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await done.catch(() => undefined);
    throw error;
  }
}

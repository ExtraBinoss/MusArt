import type { IDBPDatabase } from "idb";
import type { StoredProject, StudioDatabase } from "../database";
import { isProjectDeleted } from "../lifecycle";
import { manifestBytes } from "../records";
import { THUMBNAIL_RENDER_VERSION } from "../thumbnails/model";
import { readProjectWriteRevision } from "../writes/revision";

export interface ThumbnailSchemaBasis {
  id: string;
  writeRevision: string;
  rendererVersion?: string;
  storageVersion: StoredProject["storageVersion"];
  assetsRevision?: string;
  pageIds: readonly string[];
}

/** Only an actual stored snapshot may donate this CAS basis. No document or original is rewritten. */
export async function refreshThumbnailSchema(
  db: IDBPDatabase<StudioDatabase>,
  basis: ThumbnailSchemaBasis,
  revisions: Record<string, string>,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  if (
    Object.keys(revisions).length !== basis.pageIds.length ||
    basis.pageIds.some(
      (id) => !Object.hasOwn(revisions, id) || typeof revisions[id] !== "string" || !revisions[id],
    )
  )
    throw Error("Invalid thumbnail schema revisions.");
  if (!isCurrent()) return false;
  const tx = db.transaction(["projects", "preferences"], "readwrite"),
    done = tx.done;
  try {
    const record = await tx.objectStore("projects").get(basis.id),
      preferences = tx.objectStore("preferences");
    if (
      !record ||
      (await isProjectDeleted(preferences, basis.id)) ||
      (await readProjectWriteRevision(preferences, basis.id)) !== basis.writeRevision ||
      record.storageVersion !== basis.storageVersion ||
      (record.storageVersion === 2 ? record.assetsRevision : undefined) !== basis.assetsRevision ||
      record.project.pages.length !== basis.pageIds.length ||
      record.project.pages.some((page, index) => page.id !== basis.pageIds[index]) ||
      !isCurrent()
    ) {
      await done;
      return false;
    }
    // A second opener can already have migrated this exact immutable snapshot.
    if (record.thumbnailRenderVersion === THUMBNAIL_RENDER_VERSION) {
      await done;
      return basis.pageIds.every((id) => record.pageRevisions?.[id] === revisions[id]);
    }
    if (record.thumbnailRenderVersion !== basis.rendererVersion) {
      await done;
      return false;
    }
    record.pageRevisions = revisions;
    record.thumbnailRenderVersion = THUMBNAIL_RENDER_VERSION;
    if (record.bytes) record.bytes.manifest = manifestBytes(record);
    await tx.objectStore("projects").put(record);
    await done;
    return true;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* A failed request may already have aborted. */
    }
    await done.catch(() => undefined);
    throw error;
  }
}

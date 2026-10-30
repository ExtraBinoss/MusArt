import { MediaStorageError } from "./errors";
import type { IDBPDatabase } from "idb";
import type { OriginalMediaAsset } from "@musart/core";
import type { StudioDatabase } from "../database";
import { readProjectWriteRevision } from "../writes/revision";

/** One lazy native Blob read; no eager buffer conversion or manifest-wide media read. */
export async function readMediaOriginal(
  db: IDBPDatabase<StudioDatabase>,
  projectId: string,
  asset: OriginalMediaAsset,
  signal?: AbortSignal,
): Promise<Blob> {
  signal?.throwIfAborted();
  const tx = db.transaction(["projects", "preferences", "mediaOriginalMeta", "mediaOriginals"]);
  const done = tx.done;
  try {
    await readProjectWriteRevision(tx.objectStore("preferences"), projectId);
    if (!(await tx.objectStore("projects").getKey(projectId)))
      throw new MediaStorageError(
        asset.kind === "audio" ? "AUDIO_ORIGINAL_MISSING" : "VIDEO_ORIGINAL_MISSING",
        "Media source project is missing.",
      );
    const key: [string, string] = [projectId, asset.originalId];
    const header = await tx.objectStore("mediaOriginalMeta").get(key);
    if (
      !header ||
      header.contentRevision !== asset.contentRevision ||
      header.byteLength !== asset.byteLength
    )
      throw new MediaStorageError(
        asset.kind === "audio" ? "AUDIO_ORIGINAL_MISSING" : "VIDEO_ORIGINAL_MISSING",
        `Media original metadata is missing or stale: ${asset.originalId}`,
      );
    const original = await tx.objectStore("mediaOriginals").get(key);
    if (
      !original ||
      original.contentRevision !== asset.contentRevision ||
      !(original.blob instanceof Blob) ||
      original.blob.size !== asset.byteLength
    )
      throw new MediaStorageError(
        asset.kind === "audio" ? "AUDIO_ORIGINAL_MISSING" : "VIDEO_ORIGINAL_MISSING",
        `Media original is missing or corrupt: ${asset.originalId}`,
      );
    await done;
    signal?.throwIfAborted();
    return original.blob;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* A completed read cannot be aborted. */
    }
    await done.catch(() => undefined);
    throw error;
  }
}

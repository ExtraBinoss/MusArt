import { MediaStorageError } from "./errors";
import type { IDBPTransaction } from "idb";
import type { AssetMetadata, StudioDatabase } from "../database";
import { logicalBytes } from "../logical-bytes";
import type { StoredMediaHeader, StoredMediaOriginal } from "./model";

export const PROJECT_WRITE_STORES = [
  "projects",
  "assets",
  "preferences",
  "thumbnails",
  "mediaOriginals",
  "mediaOriginalMeta",
] as const;
export type ProjectWriteTransaction = IDBPTransaction<
  StudioDatabase,
  typeof PROJECT_WRITE_STORES,
  "readwrite"
>;

export function mediaOriginalBytes(header: StoredMediaHeader): number {
  return header.byteLength + logicalBytes(header);
}

/** Existing history may still reference a removed clip. Originals live until project retirement. */
export async function retainedMediaBytes(
  tx: ProjectWriteTransaction,
  projectId: string,
): Promise<number> {
  let bytes = 0;
  let cursor = await tx.objectStore("mediaOriginalMeta").index("by-project").openCursor(projectId);
  while (cursor) {
    bytes += mediaOriginalBytes(cursor.value);
    cursor = await cursor.continue();
  }
  return bytes;
}

/** Metadata headers are cheap to check. Binary records are never fetched by manifest saves. */
export async function persistMediaOriginals(
  tx: ProjectWriteTransaction,
  projectId: string,
  descriptions: readonly AssetMetadata[],
  incoming: readonly StoredMediaOriginal[],
): Promise<{ bytes: number; changed: boolean }> {
  if (!Array.isArray(incoming) || incoming.length > 100) throw Error("Invalid binary media batch.");
  const required = new Map<string, Extract<AssetMetadata, { kind: "video" }>>();
  for (const asset of descriptions) {
    if (asset.kind !== "video") continue;
    const previous = required.get(asset.originalId);
    if (
      previous &&
      (previous.contentRevision !== asset.contentRevision ||
        previous.byteLength !== asset.byteLength)
    )
      throw Error("Conflicting immutable video original references.");
    required.set(asset.originalId, asset);
  }
  const staged = new Map<string, StoredMediaOriginal>();
  let stagedBytes = 0;
  for (const original of incoming) {
    const asset = required.get(original.originalId);
    if (
      !asset ||
      original.projectId !== projectId ||
      staged.has(original.originalId) ||
      original.contentRevision !== asset.contentRevision ||
      !(original.blob instanceof Blob) ||
      original.blob.size !== asset.byteLength
    )
      throw Error("Invalid binary original or content revision.");
    if (
      original.blob.size > 512 * 1024 * 1024 ||
      (stagedBytes += original.blob.size) > 1024 * 1024 * 1024
    )
      throw new MediaStorageError(
        "VIDEO_STORAGE_LIMIT",
        "Video import exceeds the 512 MiB file or 1 GiB batch limit.",
      );
    staged.set(original.originalId, original);
  }
  let bytes = 0,
    retained: number | null = null,
    changed = false;
  for (const asset of required.values()) {
    const key: [string, string] = [projectId, asset.originalId];
    const previous = await tx.objectStore("mediaOriginalMeta").get(key);
    if (previous) {
      if (
        previous.contentRevision !== asset.contentRevision ||
        previous.byteLength !== asset.byteLength
      )
        throw Error("An immutable video original cannot be replaced.");
      continue;
    }
    const original = staged.get(asset.originalId);
    if (!original)
      throw new MediaStorageError(
        "VIDEO_ORIGINAL_MISSING",
        `Video original is missing: ${asset.originalId}`,
      );
    const header: StoredMediaHeader = {
      projectId,
      originalId: asset.originalId,
      contentRevision: asset.contentRevision,
      byteLength: asset.byteLength,
    };
    if (retained === null) {
      const value = await tx.objectStore("preferences").get(`media-original-bytes:${projectId}`);
      retained = value === undefined ? await retainedMediaBytes(tx, projectId) : Number(value);
      if (!Number.isSafeInteger(retained) || retained < 0)
        throw Error("Invalid binary media accounting.");
    }
    const projected = retained + bytes + mediaOriginalBytes(header);
    if (!Number.isSafeInteger(projected) || projected > 2 * 1024 * 1024 * 1024)
      throw new MediaStorageError(
        "VIDEO_STORAGE_LIMIT",
        "This project's retained video originals exceed the 2 GiB storage limit.",
      );
    await tx.objectStore("mediaOriginals").add(original);
    await tx.objectStore("mediaOriginalMeta").add(header);
    bytes += mediaOriginalBytes(header);
    changed = true;
  }
  if (changed)
    await tx
      .objectStore("preferences")
      .put(String(retained! + bytes), `media-original-bytes:${projectId}`);
  return { bytes, changed };
}

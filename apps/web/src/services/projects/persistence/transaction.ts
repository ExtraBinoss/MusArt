import type { IDBPDatabase } from "idb";
import type { AssetMetadata, StoredProject, StudioDatabase } from "../database";
import { logicalBytes } from "../logical-bytes";
import { legacyThumbnailBytes, manifestBytes, thumbnailBytes, thumbnailInfo } from "../records";
import {
  assertProjectWriteRevision,
  renewProjectWriteRevision,
  StaleProjectWriteError,
} from "../writes/revision";
import type { ProjectWriteFrame, ProjectWriteResult } from "./model";
import { validateProjectWrite } from "./validate";
import {
  PROJECT_WRITE_STORES,
  persistMediaOriginals,
  retainedMediaBytes,
} from "../media/persistence";
import type { StoredMediaOriginal } from "../media/model";
export class AssetBasisMismatchError extends Error {
  readonly code = "ASSET_BASIS_MISMATCH";
  constructor() {
    super("Original asset baseline changed; resend the captured originals.");
    this.name = "AssetBasisMismatchError";
  }
}
/** Every await inside this lock is an IndexedDB request. Hashing and message assembly finish first. */
export async function persistProjectWrite(
  db: IDBPDatabase<StudioDatabase>,
  frame: ProjectWriteFrame,
  mediaOriginals: readonly StoredMediaOriginal[] = [],
): Promise<ProjectWriteResult> {
  validateProjectWrite(frame);
  const id = frame.document.id;
  const tx = db.transaction(PROJECT_WRITE_STORES, "readwrite"),
    done = tx.done;
  try {
    await assertProjectWriteRevision(tx.objectStore("preferences"), id, frame.expectedRevision);
    const previous = await tx.objectStore("projects").get(id);
    if (frame.requireAbsent && previous) throw new StaleProjectWriteError(id);
    if (
      frame.basis !== undefined &&
      (previous?.storageVersion !== 2 || previous.assetsRevision !== frame.basis)
    )
      throw new AssetBasisMismatchError();
    const assetStore = tx.objectStore("assets"),
      incoming = new Map(frame.originals.map((asset) => [asset.assetId, asset])),
      metadata: Record<string, AssetMetadata> = {};
    for (const description of frame.descriptions)
      Object.defineProperty(metadata, description.id, { value: description, enumerable: true });
    let persisted: Map<string, string> | undefined;
    if (
      frame.basis === undefined ||
      previous?.storageVersion !== 2 ||
      previous.bytes?.assets === undefined
    )
      persisted = new Map(
        (await assetStore.index("by-project").getAll(id)).map((asset) => [
          asset.assetId,
          asset.dataUrl,
        ]),
      );
    let assetsBytes =
        (previous?.storageVersion === 2 ? previous.bytes?.assets : undefined) ??
        [...persisted!].reduce(
          (sum, [assetId, dataUrl]) => sum + logicalBytes({ projectId: id, assetId, dataUrl }),
          0,
        ),
      changed = false;
    if (previous?.storageVersion !== 2 || previous.bytes?.assets === undefined)
      assetsBytes += await retainedMediaBytes(tx, id);
    const media = await persistMediaOriginals(tx, id, frame.descriptions, mediaOriginals);
    assetsBytes += media.bytes;
    changed ||= media.changed;
    for (const description of frame.descriptions) {
      if (description.kind === "video" || description.kind === "audio") continue;
      const original = incoming.get(description.id);
      if (!original) {
        if (
          frame.basis === undefined ||
          !previous ||
          !Object.hasOwn(previous.project.assets, description.id)
        )
          throw Error(`Missing captured original: ${description.id}`);
        continue;
      }
      const old =
        persisted?.get(description.id) ??
        (frame.basis !== undefined
          ? (await assetStore.get([id, description.id]))?.dataUrl
          : undefined);
      if (old !== original.dataUrl) {
        assetsBytes +=
          logicalBytes(original) -
          (old === undefined
            ? 0
            : logicalBytes({ projectId: id, assetId: description.id, dataUrl: old }));
        await assetStore.put(original);
        changed = true;
      }
    }
    const oldIds = persisted ? persisted.keys() : Object.keys(previous!.project.assets);
    for (const assetId of oldIds)
      if (!Object.hasOwn(metadata, assetId)) {
        const dataUrl = persisted?.get(assetId) ?? (await assetStore.get([id, assetId]))?.dataUrl;
        if (dataUrl !== undefined) assetsBytes -= logicalBytes({ projectId: id, assetId, dataUrl });
        await assetStore.delete([id, assetId]);
        changed = true;
      }
    let revision = previous?.storageVersion === 2 ? (previous.assetsRevision ?? "") : "";
    if (changed || !revision) {
      const sequence = Number(
        (await tx.objectStore("preferences").get("asset-revision-sequence")) ?? "0",
      );
      if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence >= Number.MAX_SAFE_INTEGER)
        throw Error("Compteur des ressources locales invalide.");
      revision = `assets:${sequence + 1}`;
      await tx.objectStore("preferences").put(String(sequence + 1), "asset-revision-sequence");
    }
    const preview = frame.thumbnail ?? previous?.thumbnail;
    let infos = previous ? previous.thumbnailInfo : [],
      thumbnailsBytes = previous ? previous.bytes?.thumbnails : 0;
    if (infos === undefined || thumbnailsBytes === undefined) {
      const records = await tx.objectStore("thumbnails").index("by-project").getAll(id);
      infos = records.map(thumbnailInfo);
      thumbnailsBytes = records.reduce(
        (sum, record) => sum + thumbnailBytes(record),
        legacyThumbnailBytes(previous?.thumbnail),
      );
    }
    for (const info of infos)
      if (!Object.hasOwn(frame.pageRevisions, info.pageId)) {
        const old = await tx.objectStore("thumbnails").get([id, info.pageId]);
        if (old) thumbnailsBytes -= thumbnailBytes(old);
        await tx.objectStore("thumbnails").delete([id, info.pageId]);
      }
    thumbnailsBytes += legacyThumbnailBytes(preview) - legacyThumbnailBytes(previous?.thumbnail);
    const record: StoredProject = {
      id,
      storageVersion: 2,
      assetsRevision: revision,
      project: { ...frame.document, assets: metadata },
      pageRevisions: frame.pageRevisions,
      thumbnailRenderVersion: frame.thumbnailRenderVersion,
      thumbnailInfo: infos.filter((info) => Object.hasOwn(frame.pageRevisions, info.pageId)),
      ...(preview ? { thumbnail: preview } : {}),
      bytes: {
        manifest: 0,
        assets: assetsBytes,
        thumbnails: thumbnailsBytes,
        ...(frame.pagePayloads ? { pagePayloads: frame.pagePayloads } : {}),
      },
    };
    record.bytes!.manifest = manifestBytes(record);
    await tx.objectStore("projects").put(record);
    const writeRevision = await renewProjectWriteRevision(tx.objectStore("preferences"), id);
    if (frame.remember) await tx.objectStore("preferences").put(id, "last-project");
    await done;
    return { projectId: id, assetsRevision: revision, writeRevision };
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await done.catch(() => undefined);
    throw error;
  }
}

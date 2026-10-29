import { isVideoAsset } from "@musart/core";
import { mediaOriginalBytes } from "./media/persistence";
import type { IDBPDatabase } from "idb";
import type { ProjectUsage, OriginStorageEstimate } from "../../state/contracts";
import type { ProjectBytes, StudioDatabase } from "./database";
import { logicalBytes } from "./logical-bytes";
import { legacyThumbnailBytes, manifestBytes, thumbnailBytes } from "./records";
import { HistoryStore } from "../history/store";
export async function projectUsage(
  db: IDBPDatabase<StudioDatabase>,
  id: string,
): Promise<ProjectUsage> {
  const history = await new HistoryStore(async () => db).usage(id);
  const tx = db.transaction(["projects", "assets", "thumbnails", "mediaOriginalMeta"], "readwrite"),
    done = tx.done;
  try {
    const record = await tx.objectStore("projects").get(id);
    if (!record) throw new Error("Projet local introuvable.");
    let bytes: ProjectBytes;
    if (record.bytes) bytes = record.bytes;
    else {
      let assets = 0;
      if (record.storageVersion === 2) {
        let cursor = await tx.objectStore("assets").index("by-project").openCursor(id);
        while (cursor) {
          assets += logicalBytes(cursor.value);
          cursor = await cursor.continue();
        }
      } else
        for (const asset of Object.values(record.project.assets).filter(
          (asset) => !isVideoAsset(asset),
        ))
          assets += logicalBytes({ projectId: id, assetId: asset.id, dataUrl: asset.dataUrl });
      let media = await tx.objectStore("mediaOriginalMeta").index("by-project").openCursor(id);
      while (media) {
        assets += mediaOriginalBytes(media.value);
        media = await media.continue();
      }
      let thumbnails = legacyThumbnailBytes(record.thumbnail);
      let cursor = await tx.objectStore("thumbnails").index("by-project").openCursor(id);
      while (cursor) {
        thumbnails += thumbnailBytes(cursor.value);
        cursor = await cursor.continue();
      }
      // Legacy records are readable without copying original strings into manifest accounting.
      const virtual =
        record.storageVersion === 2
          ? record
          : {
              ...record,
              project: {
                ...record.project,
                assets: Object.fromEntries(
                  Object.values(record.project.assets).map(({ dataUrl: _original, ...asset }) => [
                    asset.id,
                    asset,
                  ]),
                ),
              },
            };
      bytes = { manifest: manifestBytes(virtual as typeof record), assets, thumbnails };
      record.bytes = bytes;
      await tx.objectStore("projects").put(record);
    }
    await done;
    const breakdown = {
      manifest: bytes.manifest,
      assets: bytes.assets,
      thumbnails: bytes.thumbnails,
      historyEvents: history.bytes.events,
      historyAssets: history.bytes.assets,
      historyBase: history.bytes.base,
      historyMetadata: history.metadata,
    };
    return {
      projectId: id,
      basis: "logical-utf8",
      bytes: {
        ...breakdown,
        total: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
      },
      history: { count: history.count, limit: history.limit, enabled: history.enabled },
    };
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* A failed native request may already abort the transaction. */
    }
    await done.catch(() => undefined);
    throw error;
  }
}
/** The browser reports a global approximate physical footprint, never a per-project measurement. */
export async function estimateOriginStorage(): Promise<OriginStorageEstimate | undefined> {
  if (!navigator.storage?.estimate) return undefined;
  try {
    const estimate = await navigator.storage.estimate();
    return {
      approximate: true,
      ...(typeof estimate.usage === "number" && Number.isFinite(estimate.usage)
        ? { usage: estimate.usage }
        : {}),
      ...(typeof estimate.quota === "number" && Number.isFinite(estimate.quota)
        ? { quota: estimate.quota }
        : {}),
    };
  } catch {
    return undefined;
  }
}

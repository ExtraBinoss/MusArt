import { validateProject, type Asset, type Project } from "@musart/core";
import type { IDBPDatabase } from "idb";
import type { StudioDatabase } from "../database";
import { readProjectWriteRevision } from "../writes/revision";

const MAX_PREVIEW_ORIGINAL_BYTES = 128 * 1024 * 1024;

/** One isolated readonly snapshot. Never remembers a project, migrates metadata or reads its journal. */
export async function readProjectPreview(
  db: IDBPDatabase<StudioDatabase>,
  id: string,
  signal?: AbortSignal,
): Promise<Project> {
  signal?.throwIfAborted();
  const tx = db.transaction(["projects", "assets", "preferences"], "readonly");
  const done = tx.done;
  const abort = () => {
    try {
      tx.abort();
    } catch {
      /* The readonly snapshot may already have completed. */
    }
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const record = await tx.objectStore("projects").get(id);
    if (!record) throw new Error("The saved project is no longer available.");
    await readProjectWriteRevision(tx.objectStore("preferences"), id);
    let project: Project;
    if (record.storageVersion === 2) {
      const assets: Record<string, Asset> = {};
      let bytes = 0;
      for (const [assetId, metadata] of Object.entries(record.project.assets)) {
        signal?.throwIfAborted();
        const original =
          metadata.kind === "video" ? undefined : await tx.objectStore("assets").get([id, assetId]);
        if (metadata.kind !== "video" && !original)
          throw new Error(`Saved preview original is missing: ${metadata.name}`);
        bytes += original ? original.dataUrl.length * 2 : 0;
        if (bytes > MAX_PREVIEW_ORIGINAL_BYTES)
          throw new Error("The saved preview exceeds its original-data budget.");
        Object.defineProperty(assets, assetId, {
          value: metadata.kind === "video" ? metadata : { ...metadata, dataUrl: original!.dataUrl },
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      project = { ...record.project, assets };
    } else {
      project = record.project;
      let bytes = 0;
      for (const asset of Object.values(project.assets)) {
        if (asset.kind !== "video") bytes += asset.dataUrl.length * 2;
        if (bytes > MAX_PREVIEW_ORIGINAL_BYTES)
          throw new Error("The saved preview exceeds its original-data budget.");
      }
    }
    await done;
    signal?.throwIfAborted();
    validateProject(project);
    if (project.id !== id) throw new Error("The saved project preview identity is inconsistent.");
    return project;
  } catch (error) {
    abort();
    await done.catch(() => undefined);
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

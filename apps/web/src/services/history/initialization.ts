import { stateFromProject, type Project } from "@musart/core";
import type { HistoryMetadata } from "./model";
import type { HistoryWrite } from "./transactions";
import { DEFAULT_HISTORY_LIMIT } from "./model";
import { logicalBytes } from "../projects/logical-bytes";
import { assertProjectWritable } from "../projects/lifecycle";
/** Initial base and original pool are created once in the caller's atomic transaction. */
export async function initializeHistory(
  tx: HistoryWrite,
  project: Project,
  pageId: string,
  fingerprint: string,
): Promise<HistoryMetadata> {
  await assertProjectWritable(tx.objectStore("preferences"), project.id);
  const metaStore = tx.objectStore("journalMeta"),
    existing = await metaStore.get(project.id);
  if (existing) {
    if (!existing.epoch) {
      existing.epoch = crypto.randomUUID();
      await metaStore.put(existing);
    }
    return existing;
  }
  const base = { projectId: project.id, pageId, state: stateFromProject(project), at: 0 };
  const meta: HistoryMetadata = {
    version: 1,
    epoch: crypto.randomUUID(),
    projectId: project.id,
    first: 0,
    next: 0,
    count: 0,
    limit: DEFAULT_HISTORY_LIMIT,
    enabled: true,
    lastAt: 0,
    lastStamp: project.updatedAt,
    lastFingerprint: fingerprint,
    bytes: { events: 0, assets: 0, base: logicalBytes(base) },
    eventBytesWritten: 0,
    eventBytesPruned: 0,
  };
  await tx.objectStore("journalBase").put(base);
  for (const asset of Object.values(project.assets)) {
    const record = { projectId: project.id, assetId: asset.id, asset };
    meta.bytes!.assets += logicalBytes(record);
    await tx.objectStore("journalAssets").put(record);
  }
  await metaStore.put(meta);
  return meta;
}

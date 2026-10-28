import type { IDBPDatabase } from "idb";
import type { StudioDatabase } from "../projects/database";
import { logicalBytes } from "../projects/logical-bytes";
import type { HistoryMetadata, HistoryUsage, StoredHistoryEvent } from "./model";
import { DEFAULT_HISTORY_LIMIT } from "./model";
import { writeHistory } from "./transactions";
export function eventBytes(record: StoredHistoryEvent): number {
  const { cumulativeBytes: _cache, ...payload } = record;
  return logicalBytes(payload);
}
export function metadataBytes(meta: HistoryMetadata): number {
  const {
    bytes: _bytes,
    eventBytesWritten: _written,
    eventBytesPruned: _pruned,
    ...payload
  } = meta;
  return logicalBytes(payload);
}
/** Cached in one transaction; legacy counters are populated only when insights are explicitly opened. */
export async function historyUsage(
  db: IDBPDatabase<StudioDatabase>,
  projectId: string,
): Promise<HistoryUsage> {
  return writeHistory(db, async (tx) => {
    const meta = await tx.objectStore("journalMeta").get(projectId);
    if (!meta)
      return {
        bytes: { events: 0, assets: 0, base: 0 },
        metadata: 0,
        count: 0,
        limit: DEFAULT_HISTORY_LIMIT,
        enabled: true,
      };
    if (!meta.bytes) {
      let events = 0,
        count = 0,
        tailBytes: number | undefined,
        next = meta.first;
      while (next < meta.next) {
        const batch = await tx
          .objectStore("journalEvents")
          .getAll(IDBKeyRange.bound([projectId, next], [projectId, meta.next - 1]), 100);
        if (!batch.length || batch[0]!.sequence !== next)
          throw new Error("History entries are incomplete.");
        count += batch.length;
        tailBytes = batch.at(-1)!.cumulativeBytes;
        events += batch.reduce((sum, event) => sum + eventBytes(event), 0);
        next = batch.at(-1)!.sequence + 1;
      }
      if (count !== meta.count) throw new Error("History count is inconsistent.");
      let assets = 0;
      let cursor = await tx.objectStore("journalAssets").index("by-project").openCursor(projectId);
      while (cursor) {
        assets += logicalBytes(cursor.value);
        cursor = await cursor.continue();
      }
      meta.bytes = {
        events,
        assets,
        base: logicalBytes(await tx.objectStore("journalBase").get(projectId)),
      };
      meta.eventBytesWritten = tailBytes ?? events;
      meta.eventBytesPruned = (tailBytes ?? events) - events;
      await tx.objectStore("journalMeta").put(meta);
    }
    return {
      bytes: { ...meta.bytes },
      metadata: metadataBytes(meta),
      count: meta.count,
      limit: meta.limit,
      enabled: meta.enabled,
    };
  });
}

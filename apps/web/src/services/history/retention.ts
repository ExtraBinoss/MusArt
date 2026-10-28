import { applyReplayDelta } from "@musart/core";
import type { HistoryWrite } from "./transactions";
import type { HistoryMetadata } from "./model";
import { logicalBytes } from "../projects/logical-bytes";
import { eventBytes } from "./accounting";

/** Roll the base checkpoint forward in bounded batches, retaining replayable deltas after it. */
export async function pruneHistory(tx: HistoryWrite, meta: HistoryMetadata, spare = 0) {
  if (meta.count <= meta.limit) return;
  const prune = Math.min(meta.count, meta.count - meta.limit + spare);
  const base = await tx.objectStore("journalBase").get(meta.projectId);
  if (!base) throw new Error("History base is missing.");
  const events = tx.objectStore("journalEvents");
  const last = meta.first + prune - 1;
  const range = IDBKeyRange.bound([meta.projectId, meta.first], [meta.projectId, last]);
  if ((await events.count(range)) !== prune) throw new Error("History entries are incomplete.");
  const checkpoint = await events
    .index("by-checkpoint")
    .openCursor(
      IDBKeyRange.bound(
        [meta.projectId, meta.projectId, meta.first],
        [meta.projectId, meta.projectId, last],
      ),
      "prev",
    );
  let next = meta.first;
  if (checkpoint) {
    const saved = checkpoint.value;
    base.state = saved.event.after!;
    base.at = saved.event.at;
    base.pageId = saved.event.pageId;
    next = saved.sequence + 1;
  }
  let cursor =
    next <= last
      ? await events.openCursor(IDBKeyRange.bound([meta.projectId, next], [meta.projectId, last]))
      : null;
  while (cursor) {
    const old = cursor.value.event;
    base.state = old.after ?? applyReplayDelta(base.state, old.delta);
    base.at = old.at;
    base.pageId = old.pageId;
    cursor = await cursor.continue();
  }
  if (meta.bytes) {
    const tail = await events.get([meta.projectId, last]);
    let removed = 0;
    if (tail?.cumulativeBytes !== undefined) {
      removed = tail.cumulativeBytes - (meta.eventBytesPruned ?? 0);
    } else {
      // Old journals have no prefix counters. Only the pruned legacy range is read.
      let sequence = meta.first;
      while (sequence <= last) {
        const batch = await events.getAll(
          IDBKeyRange.bound([meta.projectId, sequence], [meta.projectId, last]),
          100,
        );
        if (!batch.length) throw new Error("History entries are incomplete.");
        removed += batch.reduce((sum, record) => sum + eventBytes(record), 0);
        sequence = batch.at(-1)!.sequence + 1;
      }
    }
    meta.bytes.events -= removed;
    meta.eventBytesPruned = (meta.eventBytesPruned ?? 0) + removed;
    meta.bytes.base = logicalBytes(base);
  }
  await events.delete(range);
  meta.first += prune;
  meta.count -= prune;
  await tx.objectStore("journalBase").put(base);
}

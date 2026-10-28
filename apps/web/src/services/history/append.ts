import type { Asset, ReplayEvent, ReplayState } from "@musart/core";
import type { HistoryWrite } from "./transactions";
import { pruneHistory } from "./retention";
import { eventBytes } from "./accounting";
import { logicalBytes } from "../projects/logical-bytes";
import { assertProjectWritable } from "../projects/lifecycle";
export interface AppendHistoryOptions {
  projectId: string;
  event: ReplayEvent;
  assets: Record<string, Asset>;
  stamp: string;
  elapsed?: number;
  concurrency?: { expectedNext: number; current: ReplayState };
  fingerprint?: string;
}
/** Caller owns the transaction and precomputes cryptographic hashes before acquiring its locks. */
export async function appendInTransaction(tx: HistoryWrite, options: AppendHistoryOptions) {
  let { projectId, event, assets, stamp, elapsed = 1, concurrency, fingerprint } = options;
  await assertProjectWritable(tx.objectStore("preferences"), projectId);
  const meta = await tx.objectStore("journalMeta").get(projectId);
  if (!meta) throw new Error("History is not initialized.");
  if (
    event.projectId !== projectId ||
    !Number.isSafeInteger(meta.next) ||
    meta.next >= Number.MAX_SAFE_INTEGER
  )
    throw new Error("Invalid history sequence or project.");
  if (!meta.enabled) return meta;
  if (concurrency && concurrency.expectedNext !== meta.next)
    event = { ...event, delta: [], after: concurrency.current };
  const at = meta.lastAt + Math.max(1, Number.isFinite(elapsed) ? elapsed : 1);
  const record = {
    projectId,
    sequence: meta.next,
    event: {
      ...event,
      projectId,
      at,
      commands: event.commands.map(({ type }) => ({ type, summary: true as const })),
      ...(event.after ? { delta: [] } : {}),
    },
  };
  const size = eventBytes(record);
  if (meta.bytes) {
    meta.bytes.events += size;
    meta.eventBytesWritten = (meta.eventBytesWritten ?? meta.bytes.events - size) + size;
  }
  await tx.objectStore("journalEvents").put({
    ...record,
    ...(meta.eventBytesWritten === undefined ? {} : { cumulativeBytes: meta.eventBytesWritten }),
  });
  for (const asset of Object.values(assets)) {
    const stored = await tx.objectStore("journalAssets").get([projectId, asset.id]);
    if (stored && stored.asset.dataUrl !== asset.dataUrl)
      throw new Error("An original asset ID cannot be replaced inside a journal.");
    if (!stored) {
      const record = { projectId, assetId: asset.id, asset };
      if (meta.bytes) meta.bytes.assets += logicalBytes(record);
      await tx.objectStore("journalAssets").put(record);
    }
  }
  meta.next++;
  meta.count++;
  meta.lastAt = at;
  meta.lastStamp = stamp;
  if (fingerprint) meta.lastFingerprint = fingerprint;
  else delete meta.lastFingerprint;
  await pruneHistory(tx, meta, Math.max(1, Math.min(250, Math.floor(meta.limit / 10))));
  await tx.objectStore("journalMeta").put(meta);
  return meta;
}

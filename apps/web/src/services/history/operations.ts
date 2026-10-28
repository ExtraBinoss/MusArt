import type { HistoryMetadata } from "./model";
import type { HistoryWrite } from "./transactions";
import { appendInTransaction, type AppendHistoryOptions } from "./append";
import { assertProjectWritable } from "../projects/lifecycle";
export interface HistoryOperation {
  id: string;
  epoch: string;
  expectedNext: number;
  retry: boolean;
}
export interface HistoryControlOperation {
  id: string;
  epoch: string;
  configurationId?: string;
}
export function assertHistoryControlOperation(operation: HistoryControlOperation): void {
  if (
    !operation.id ||
    operation.id.length > 128 ||
    !operation.epoch ||
    operation.epoch.length > 128 ||
    (operation.configurationId !== undefined &&
      (!operation.configurationId || operation.configurationId.length > 128))
  )
    throw new Error("Invalid history operation.");
}
export interface HistoryOperationResult {
  meta: HistoryMetadata;
  ownNext: number;
  replayed: boolean;
}
export class StaleHistoryOperationError extends Error {
  readonly code = "STALE_HISTORY_OPERATION";
  constructor() {
    super("This history operation was reset or its retry is ambiguous.");
    this.name = "StaleHistoryOperationError";
  }
}
/** Deduplication and the payload share one write transaction; retries never reapply accounting/pruning. */
export async function appendOperationInTransaction(
  tx: HistoryWrite,
  options: AppendHistoryOptions,
  operation: HistoryOperation,
): Promise<HistoryOperationResult> {
  const { projectId } = options;
  await assertProjectWritable(tx.objectStore("preferences"), projectId);
  assertHistoryControlOperation(operation);
  if (!Number.isSafeInteger(operation.expectedNext) || operation.expectedNext < 0)
    throw new Error("Invalid history operation.");
  const meta = await tx.objectStore("journalMeta").get(projectId);
  if (!meta) throw new StaleHistoryOperationError();
  const key = await tx
    .objectStore("journalEvents")
    .index("by-operation")
    .getKey([projectId, operation.id]);
  if (key) return { meta, ownNext: key[1] + 1, replayed: true };
  if (meta.epoch !== operation.epoch || (operation.retry && meta.next !== operation.expectedNext))
    throw new StaleHistoryOperationError();
  const result = await appendInTransaction(tx, { ...options, operationId: operation.id });
  return { meta: result, ownNext: result.next, replayed: false };
}

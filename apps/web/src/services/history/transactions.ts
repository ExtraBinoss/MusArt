import type { IDBPDatabase, IDBPTransaction } from "idb";
import type { StudioDatabase } from "../projects/database";
import { HISTORY_WRITE_STORES } from "./stores";

export type HistoryWrite = IDBPTransaction<
  StudioDatabase,
  typeof HISTORY_WRITE_STORES,
  "readwrite"
>;
/** Request errors and application errors both roll back the entire journal transaction. */
export async function writeHistory<T>(
  db: IDBPDatabase<StudioDatabase>,
  operation: (tx: HistoryWrite) => Promise<T>,
): Promise<T> {
  const tx = db.transaction(HISTORY_WRITE_STORES, "readwrite");
  const done = tx.done;
  try {
    const result = await operation(tx);
    await done;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* A failed native request may already have aborted it. */
    }
    await done.catch(() => undefined);
    throw error;
  }
}

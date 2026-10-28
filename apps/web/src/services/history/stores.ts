/** Replay reads only journal payloads; writes also lock durable project retirement markers. */
export const HISTORY_STORES = [
  "journalMeta",
  "journalBase",
  "journalEvents",
  "journalAssets",
] as const;
export const HISTORY_WRITE_STORES = [...HISTORY_STORES, "preferences"] as const;

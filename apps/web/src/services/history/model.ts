import type { Asset, ReplayEvent, ReplayState } from "@musart/core";

export const DEFAULT_HISTORY_LIMIT = 10000;
export const MIN_HISTORY_LIMIT = 10;
export const MAX_HISTORY_LIMIT = 100000;
export const HISTORY_PAGE_SIZE = 100;
export interface HistoryBytes {
  events: number;
  assets: number;
  base: number;
}
export interface HistoryUsage {
  bytes: HistoryBytes;
  count: number;
  limit: number;
  enabled: boolean;
  metadata: number;
}
export interface HistoryMetadata {
  version: 1;
  projectId: string;
  first: number;
  next: number;
  count: number;
  limit: number;
  enabled: boolean;
  lastAt: number;
  lastStamp: string;
  lastFingerprint?: string;
  epoch?: string;
  configurationId?: string;
  bytes?: HistoryBytes;
  eventBytesWritten?: number;
  eventBytesPruned?: number;
}
export interface HistoryBase {
  projectId: string;
  pageId: string;
  state: ReplayState;
  at: number;
}
export interface StoredHistoryEvent {
  projectId: string;
  sequence: number;
  event: ReplayEvent;
  cumulativeBytes?: number;
  operationId?: string;
}
export interface StoredHistoryAsset {
  projectId: string;
  assetId: string;
  asset: Asset;
}
export interface HistoryPage {
  entries: StoredHistoryEvent[];
  before: number | null;
  total: number;
}

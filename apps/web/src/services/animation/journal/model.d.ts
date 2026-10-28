import type { Asset, CommandCommit, ReplayState } from "@musart/core";
import type { AssetMetadata } from "../../projects/database";
import type { HistoryControlOperation, HistoryOperation } from "../../history/operations";
import type { HistoryMetadata } from "../../history/model";

export interface JournalFrame {
  state: ReplayState;
  descriptions: AssetMetadata[];
  assets: Asset[];
  pageId: string;
  revision: number;
}
export type JournalAction =
  | { kind: "ensure" }
  | {
      kind: "commit";
      operation: HistoryOperation;
      at: number;
      elapsed: number;
      types: readonly string[];
      eventKind: CommandCommit["kind"];
      checkpoint: boolean;
    }
  | { kind: "clear"; operation: HistoryControlOperation }
  | {
      kind: "configure";
      operation: HistoryControlOperation;
      ownNext: number;
      options: { limit?: number; enabled?: boolean };
    };
export interface JournalResult {
  meta: HistoryMetadata;
  ownNext: number;
}
export interface JournalFailure {
  name: string;
  message: string;
  code?: string;
}
export type FramePart = import("../../serialization/fragments/model").FragmentPart;
export type JournalRequest =
  | { type: "begin"; id: number; database: string; action: JournalAction }
  | { type: "part"; id: number; part: FramePart }
  | { type: "finish"; id: number; parts: number };
export type JournalResponse =
  | { id: number; result: JournalResult }
  | { id: number; error: JournalFailure };
export interface JournalWorkerPort {
  postMessage(message: JournalRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
}

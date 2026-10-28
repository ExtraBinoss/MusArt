import type { Asset, Command, Project, SessionSnapshot } from "../document/model";
export type ReplayState = Omit<Project, "assets" | "replay"> & { assetIds: string[] };
export type ReplayPath = readonly (string | number)[];
export type ReplayDelta =
  | { op: "set" | "insert"; path: ReplayPath; value: unknown }
  | { op: "remove"; path: ReplayPath }
  | { op: "move"; path: ReplayPath; from: ReplayPath };
export interface ReplayCommandSummary {
  type: Exclude<Command["type"], "setReplay">;
  summary: true;
}
export type ReplayCommand =
  | ReplayCommandSummary
  | Exclude<Command, { type: "addAssets" } | { type: "addLayers" } | { type: "setReplay" }>
  | { type: "addAssets"; assetIds: string[] }
  | { type: "addLayers"; layers: import("../document/model").Layer[]; assetIds?: string[] };
export interface ReplayEvent {
  at: number;
  projectId: string;
  pageId: string;
  kind?: "commit" | "undo" | "redo" | "load";
  commands: ReplayCommand[];
  delta: ReplayDelta[];
  after?: ReplayState;
}
/** Initial originals plus future original additions occur once, never in each event. */
export interface ReplaySpec {
  version: 1;
  initial: Project;
  pageId: string;
  assets: Record<string, Asset>;
  events: ReplayEvent[];
  duration: number;
}
export interface CommandCommit {
  kind: "commit" | "undo" | "redo" | "load";
  commands: readonly Command[];
  snapshot: SessionSnapshot;
}
/** Payload-free commit metadata for observers that only need command labels and immutable state. */
export interface CommandCommitInfo {
  kind: CommandCommit["kind"];
  types: readonly Command["type"][];
  snapshot: SessionSnapshot;
}
export interface ReplayRecording {
  snapshot(): ReplaySpec;
  stop(): ReplaySpec;
  dispose(): void;
}
export interface ReplayObserveOptions {
  now?: () => number;
  checkpointInterval?: number;
  commandMode?: "full" | "summary";
  /** Own ordering, awaiting and asynchronous error reporting for each captured emission. */
  schedule?: (emit: () => void | Promise<void>) => void;
  onEvent: (
    event: ReplayEvent,
    addedAssets: Record<string, Asset>,
    snapshotCapture: SessionSnapshot,
  ) => void | Promise<void>;
}
export interface ReplayRecordOptions {
  now?: () => number;
  checkpointInterval?: number;
  retainEvents?: boolean;
  onEvent?: (event: ReplayEvent, addedAssets: Record<string, Asset>) => void;
}

export interface ModelDownloadEvent {
  file: string;
  status: "progress" | "done";
  loaded?: number;
  total?: number;
}
export interface ModelCacheInfo {
  available: boolean;
  bytes: number;
  files: number;
  supported: boolean;
}
export interface ModelStatus extends ModelCacheInfo {
  phase: "idle" | "loading" | "initializing" | "ready" | "removing" | "error";
  loaded: number;
  total: number;
  error?: string;
}
export interface LocalModelPort {
  read: () => Readonly<ModelStatus>;
  subscribe: (listener: () => void) => () => void;
  refresh(): Promise<void>;
  prepare(): Promise<void>;
  cancel(): void;
  remove(): Promise<void>;
}

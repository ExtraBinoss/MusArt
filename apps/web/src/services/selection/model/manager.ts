import { inspectModelCache, removeModelCache } from "./cache";
import { MODEL_BYTES, MODEL_FILES, modelFile } from "./manifest";
import type { LocalModelPort, ModelCacheInfo, ModelDownloadEvent, ModelStatus } from "./contract";

export class LocalModelManager implements LocalModelPort {
  private snapshot: Readonly<ModelStatus> = Object.freeze({
    phase: "idle",
    available: false,
    supported: typeof globalThis.caches !== "undefined",
    bytes: 0,
    files: 0,
    loaded: 0,
    total: MODEL_BYTES,
  });
  private readonly listeners = new Set<() => void>();
  private readonly progress = new Map<string, number>();
  private generation = 0;
  private active: Promise<void> | null = null;
  constructor(
    private readonly operations: {
      prepare: () => Promise<void>;
      cancel: () => void;
      inspect?: () => Promise<ModelCacheInfo>;
      remove?: () => Promise<ModelCacheInfo>;
    },
  ) {}
  read = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<ModelStatus>): void {
    const next = { ...this.snapshot, ...patch };
    if (
      Object.entries(next).every(
        ([key, value]) => this.snapshot[key as keyof ModelStatus] === value,
      )
    )
      return;
    this.snapshot = Object.freeze(next);
    for (const listener of this.listeners) listener();
  }
  note = (event: ModelDownloadEvent): void => {
    if (this.snapshot.phase === "removing") return;
    const file = modelFile(event.file);
    if (!file || (event.status !== "done" && (!Number.isFinite(event.loaded) || event.loaded! < 0)))
      return;
    this.progress.set(
      file,
      event.status === "done" ? MODEL_FILES[file]! : Math.min(event.loaded!, MODEL_FILES[file]!),
    );
    const loaded = [...this.progress.values()].reduce((sum, value) => sum + value, 0);
    this.publish({
      loaded,
      phase: loaded === MODEL_BYTES ? "initializing" : "loading",
      error: undefined,
    });
  };
  ready = (): void => {
    this.publish({ phase: "ready", loaded: MODEL_BYTES, error: undefined });
  };
  failed = (error: unknown): void => {
    if (this.snapshot.phase === "loading" || this.snapshot.phase === "initializing")
      this.publish({
        phase: "error",
        error: error instanceof Error ? error.message : String(error),
      });
  };
  async refresh(): Promise<void> {
    const generation = this.generation;
    const cache = await (this.operations.inspect ?? inspectModelCache)();
    if (generation === this.generation) this.publish(cache);
  }
  prepare(): Promise<void> {
    if (this.active || this.snapshot.phase === "removing")
      return Promise.reject(new Error("The local model is busy."));
    const generation = ++this.generation;
    this.progress.clear();
    this.publish({ phase: "loading", loaded: 0, error: undefined });
    const run = (async () => {
      try {
        await this.operations.prepare();
        if (generation !== this.generation)
          throw new DOMException("Model preparation cancelled.", "AbortError");
        this.ready();
        await this.refresh();
      } catch (error) {
        if (generation === this.generation)
          this.publish({
            phase: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        throw error;
      }
    })();
    this.active = run;
    const settle = () => {
      if (this.active === run) this.active = null;
    };
    void run.then(settle, settle);
    return run;
  }
  cancel(): void {
    this.generation++;
    this.operations.cancel();
    this.active = null;
    this.progress.clear();
    this.publish({ phase: "idle", loaded: 0, error: undefined });
  }
  async remove(): Promise<void> {
    if (this.active || this.snapshot.phase === "removing")
      throw new Error("Cancel model preparation before removing its files.");
    const generation = ++this.generation;
    this.operations.cancel();
    this.publish({ phase: "removing", error: undefined });
    try {
      const cache = await (this.operations.remove ?? removeModelCache)();
      if (generation === this.generation) {
        this.progress.clear();
        this.publish({ ...cache, phase: "idle", loaded: 0 });
      }
    } catch (error) {
      if (generation === this.generation)
        this.publish({
          phase: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      throw error;
    }
  }
  dispose(): void {
    this.generation++;
    this.listeners.clear();
  }
}

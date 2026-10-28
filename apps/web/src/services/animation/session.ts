import { observeReplay, stateFromProject, type EnginePort } from "@musart/core";
import type { HistoryStore } from "../history/store";
import { DEFAULT_HISTORY_LIMIT } from "../history/model";
import { PaintYield } from "./paint-yield";

export interface AnimationState {
  ready: boolean;
  recording: boolean;
  events: number;
  limit: number;
  pending: number;
  version: number;
  error: boolean;
}
/** Automatic durable journal. No event array or original image pool is retained in React. */
export class AnimationSession {
  private state: AnimationState = {
    ready: false,
    recording: true,
    events: 0,
    limit: DEFAULT_HISTORY_LIMIT,
    pending: 0,
    version: 0,
    error: false,
  };
  private listeners = new Set<() => void>();
  private stopObserver: (() => void) | null = null;
  private expectedNext = new Map<string, number>();
  private queue: Promise<void> = Promise.resolve();
  private readonly paintYield = new PaintYield();
  private drains = 0;
  private store: HistoryStore | null = null;
  private onError: (error: unknown) => void = () => {};
  constructor(private readonly engine: EnginePort) {}
  read = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<AnimationState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private enqueue(task: () => Promise<void>, propagate = false) {
    this.publish({ pending: this.state.pending + 1 });
    const operation = this.queue.then(async () => {
      if (!this.drains) await this.paintYield.wait();
      await task();
    });
    this.queue = operation
      .catch((error: unknown) => {
        this.publish({ error: true });
        this.onError(error);
      })
      .finally(() => this.publish({ pending: this.state.pending - 1 }));
    return propagate ? this.queue.then(() => operation) : this.queue;
  }
  attach(store: HistoryStore, onError: (error: unknown) => void) {
    if (this.stopObserver) return;
    this.store = store;
    this.onError = onError;
    const known = new Set<string>();
    const previousAt = new Map<string, number>();
    const recovery = new Set<string>();
    const initial = this.engine.getSnapshot();
    void this.enqueue(async () => {
      const meta = await store.ensure(initial.project, initial.pageId);
      known.add(initial.project.id);
      this.expectedNext.set(initial.project.id, meta.next);
      if (this.engine.getSnapshot().project.id === meta.projectId)
        this.publish({
          ready: true,
          recording: meta.enabled,
          events: meta.count,
          limit: meta.limit,
          error: false,
        });
    });
    this.stopObserver = observeReplay(this.engine, {
      now: () => performance.now(),
      checkpointInterval: 250,
      commandMode: "summary",
      schedule: (emit) => {
        void this.enqueue(async () => {
          await emit();
        });
      },
      onEvent: async (event, assets, snapshot) => {
        const elapsed = event.at - (previousAt.get(event.projectId) ?? 0);
        previousAt.set(event.projectId, event.at);
        try {
          let checkpoint = recovery.has(event.projectId);
          if (!known.has(event.projectId)) {
            const meta = await store.ensure(snapshot.project, snapshot.pageId);
            known.add(event.projectId);
            this.expectedNext.set(event.projectId, meta.next);
            // The new base already contains this commit. Reapplying an insertion would duplicate it.
            checkpoint = true;
          }
          const current = stateFromProject(snapshot.project);
          const durableEvent = checkpoint ? { ...event, delta: [], after: current } : event;
          const meta = await store.append(
            event.projectId,
            durableEvent,
            checkpoint ? snapshot.project.assets : assets,
            snapshot.project.updatedAt,
            elapsed,
            { expectedNext: this.expectedNext.get(event.projectId)!, current },
          );
          this.expectedNext.set(event.projectId, meta.next);
          recovery.delete(event.projectId);
          if (this.engine.getSnapshot().project.id === event.projectId)
            this.publish({
              ready: true,
              events: meta.count,
              recording: meta.enabled,
              limit: meta.limit,
              error: false,
              version: this.state.version + 1,
            });
        } catch (error) {
          // Observation has advanced even when IDB rolls back. The next write must resynchronize.
          recovery.add(event.projectId);
          throw error;
        }
      },
    });
  }
  configure = (options: { limit?: number; enabled?: boolean }) => {
    const snapshot = this.engine.getSnapshot(),
      previousRecording = this.state.recording;
    if (options.enabled !== undefined) this.publish({ recording: options.enabled });
    return this.enqueue(async () => {
      try {
        if (!this.store) throw new Error("History is not attached.");
        await this.store.configure(snapshot.project.id, options);
        const meta = options.enabled
          ? await this.store.ensure(snapshot.project, snapshot.pageId)
          : await this.store.info(snapshot.project.id);
        if (meta && options.enabled) this.expectedNext.set(snapshot.project.id, meta.next);
        if (meta && this.engine.getSnapshot().project.id === snapshot.project.id)
          this.publish({
            recording: meta.enabled,
            events: meta.count,
            limit: meta.limit,
            error: false,
            version: this.state.version + 1,
          });
      } catch (error) {
        const meta = await this.store?.info(snapshot.project.id).catch(() => undefined);
        if (this.engine.getSnapshot().project.id === snapshot.project.id)
          this.publish({ recording: meta?.enabled ?? previousRecording });
        throw error;
      }
    });
  };
  clear = () => {
    // Capture before queuing: later gestures must replay after this exact new base.
    const snapshot = this.engine.getSnapshot();
    return this.enqueue(async () => {
      if (!this.store) throw new Error("History is not attached.");
      const meta = await this.store.clear(snapshot.project, snapshot.pageId);
      this.expectedNext.set(snapshot.project.id, meta.next);
      if (this.engine.getSnapshot().project.id === snapshot.project.id)
        this.publish({
          ready: true,
          events: 0,
          recording: meta.enabled,
          limit: meta.limit,
          error: false,
          version: this.state.version + 1,
        });
    }, true);
  };
  start = () => this.configure({ enabled: true });
  stop = () => this.configure({ enabled: false });
  flush = async () => {
    this.drains++;
    this.paintYield.release();
    try {
      await this.queue;
    } finally {
      this.drains--;
    }
  };
  page = async (before?: number) => {
    await this.flush();
    if (!this.store) throw new Error("History is not attached.");
    return this.store.page(this.engine.getSnapshot().project.id, before);
  };
  replay = async (signal?: AbortSignal) => {
    await this.flush();
    if (!this.store) throw new Error("History is not attached.");
    return this.store.replay(this.engine.getSnapshot().project.id, signal);
  };
  dispose = async () => {
    this.stopObserver?.();
    this.stopObserver = null;
    await this.flush();
  };
}
const sessions = new WeakMap<EnginePort, AnimationSession>();
export function getAnimationSession(engine: EnginePort): AnimationSession {
  let session = sessions.get(engine);
  if (!session) {
    session = new AnimationSession(engine);
    sessions.set(engine, session);
  }
  return session;
}

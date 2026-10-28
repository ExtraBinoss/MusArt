import type { EnginePort, ReplayTransition, SessionSnapshot } from "@musart/core";
import { getCanonicalPresentation } from "../../../state/session/canonical-presentation";
import type { HistoryMetadata } from "../../history/model";
import type { HistoryStore } from "../../history/store";
import { snapshotProject } from "../../projects/writes/snapshot";
import { captureJournalFrame } from "./frame";
import type { JournalAction, JournalFrame, JournalResult } from "./model";
import { JournalTransportError, JournalQueueFullError, journalResult } from "./protocol";
import { JournalTransport, type JournalTransportOptions } from "./transport";
import type { JournalProcessor } from "./processor";

const MAX_PENDING = 128;
const MAX_HEADERS = 128;
interface Header {
  meta: HistoryMetadata;
  ownNext: number;
  generation: number;
}
export interface JournalClientOptions extends JournalTransportOptions {
  fallback?: (database: string) => Promise<Pick<JournalProcessor, "run" | "dispose">>;
}

/** Bounded FIFO admission. Accepted immutable captures survive navigation and disposal. */
export class JournalClient {
  private readonly transport: JournalTransport;
  private readonly headers = new Map<string, Header>();
  private readonly previousAt = new Map<string, number>();
  private readonly recovery = new Set<string>();
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private closed = false;
  private fallback: Pick<JournalProcessor, "run" | "dispose"> | null = null;
  private database: string | null = null;
  private disposal: Promise<void> | null = null;
  private generation = 0;
  constructor(
    private readonly store: HistoryStore,
    engine: EnginePort,
    private readonly options: JournalClientOptions = {},
  ) {
    this.transport = new JournalTransport(getCanonicalPresentation(engine), options);
  }
  private enqueue(task: () => Promise<HistoryMetadata>): Promise<HistoryMetadata> {
    if (this.closed) return Promise.reject(new Error("Journal client is disposed."));
    if (this.pending >= MAX_PENDING) return Promise.reject(new JournalQueueFullError());
    this.pending++;
    const operation = this.tail.catch(() => {}).then(task);
    this.tail = operation.finally(() => {
      this.pending--;
    });
    void this.tail.catch(() => {});
    return operation;
  }
  recover = (projectId: string): void => {
    this.generation++;
    this.headers.clear();
    this.failed(projectId);
  };
  isRecovering = (projectId: string): boolean =>
    this.recovery.has(projectId) || this.headers.get(projectId)?.generation !== this.generation;
  private failed(projectId: string): void {
    this.headers.delete(projectId);
    this.recovery.add(projectId);
    while (this.recovery.size > MAX_HEADERS) {
      const first = this.recovery.values().next().value!;
      this.recovery.delete(first);
      this.headers.delete(first);
    }
  }
  private remember(result: JournalResult, generation: number): HistoryMetadata {
    this.headers.delete(result.meta.projectId);
    this.headers.set(result.meta.projectId, { ...result, generation });
    while (this.headers.size > MAX_HEADERS) {
      const first = this.headers.keys().next().value!;
      this.headers.delete(first);
      this.previousAt.delete(first);
    }
    return result.meta;
  }
  private async execute(action: JournalAction, frame: JournalFrame): Promise<JournalResult> {
    this.database ??= await this.store.databaseName();
    if (this.fallback) return journalResult(await this.fallback.run(action, frame));
    let current = action;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.transport.run(this.database, current, frame);
      } catch (error) {
        if (!(error instanceof JournalTransportError)) throw error;
        if (current.kind === "ensure" && error.uncertain) {
          const failure = new Error(
            "Journal initialization acknowledgment was lost; its old snapshot was not reapplied. Retry after checking the current project.",
          );
          failure.name = "JournalInitializationUncertainError";
          Object.defineProperty(failure, "code", { value: "UNCERTAIN_JOURNAL_INITIALIZATION" });
          throw failure;
        }
        if (current.kind === "commit")
          current = { ...current, operation: { ...current.operation, retry: true } };
      }
    }
    // A transport failure can follow a successful transaction. Reuse the same operation identity.
    this.transport.dispose();
    const fallback = await (this.options.fallback?.(this.database) ??
      import("./processor").then(({ JournalProcessor }) => new JournalProcessor(this.database!)));
    this.fallback = fallback;
    return journalResult(await fallback.run(current, frame));
  }
  private async header(
    frame: JournalFrame,
    generation: number,
  ): Promise<{ header: Header; fresh: boolean }> {
    const cached = this.headers.get(frame.state.id);
    if (cached?.generation === generation) return { header: cached, fresh: false };
    const meta = await this.store.info(frame.state.id);
    if (meta?.epoch) {
      const header = { meta, ownNext: meta.next, generation };
      this.remember(header, generation);
      return { header, fresh: true };
    }
    const result = await this.execute({ kind: "ensure" }, frame);
    this.remember(result, generation);
    return { header: { ...result, generation }, fresh: true };
  }
  ensure = (snapshot: SessionSnapshot): Promise<HistoryMetadata> => {
    const frame = captureJournalFrame(snapshot),
      generation = this.generation;
    return this.enqueue(async () => {
      try {
        const result = await this.execute({ kind: "ensure" }, frame);
        if (result.meta.enabled) this.recovery.delete(frame.state.id);
        return this.remember(result, generation);
      } catch (error) {
        this.failed(frame.state.id);
        throw error;
      }
    });
  };
  /** Capture at publication, before a presentation barrier queues execution. */
  prepareCommit = (transition: ReplayTransition): (() => Promise<HistoryMetadata>) => {
    const snapshot = {
      ...transition.snapshot,
      project: snapshotProject(transition.snapshot.project),
    };
    const frame = captureJournalFrame(snapshot, transition.previousAssets);
    const originals = snapshot.project.assets;
    const id = crypto.randomUUID(),
      generation = this.generation;
    return () =>
      this.enqueue(async () => {
        try {
          // A recovery or evicted metadata cursor needs a checkpoint and all originals once.
          const recovering =
            this.recovery.has(frame.state.id) ||
            this.headers.get(frame.state.id)?.generation !== generation;
          if (recovering) frame.assets = Object.values(originals);
          const { header, fresh } = await this.header(frame, generation);
          const elapsed = transition.at - (this.previousAt.get(frame.state.id) ?? 0);
          this.previousAt.set(frame.state.id, transition.at);
          while (this.previousAt.size > MAX_HEADERS)
            this.previousAt.delete(this.previousAt.keys().next().value!);
          const result = await this.execute(
            {
              kind: "commit",
              operation: {
                id,
                epoch: header.meta.epoch!,
                expectedNext: header.ownNext,
                retry: false,
              },
              at: transition.at,
              elapsed,
              types: transition.types,
              eventKind: transition.kind,
              checkpoint: transition.checkpoint || fresh || recovering,
            },
            frame,
          );
          if (result.meta.enabled) this.recovery.delete(frame.state.id);
          return this.remember(result, generation);
        } catch (error) {
          this.failed(frame.state.id);
          throw error;
        }
      });
  };
  commit = (transition: ReplayTransition): Promise<HistoryMetadata> =>
    this.prepareCommit(transition)();
  clear = (snapshot: SessionSnapshot): Promise<HistoryMetadata> => {
    const frame = captureJournalFrame(snapshot),
      id = crypto.randomUUID(),
      generation = this.generation;
    return this.enqueue(async () => {
      try {
        const { header } = await this.header(frame, generation);
        const result = await this.execute(
          {
            kind: "clear",
            operation: {
              id,
              epoch: header.meta.epoch!,
              configurationId: header.meta.configurationId,
            },
          },
          frame,
        );
        this.recovery.delete(frame.state.id);
        return this.remember(result, generation);
      } catch (error) {
        this.failed(frame.state.id);
        throw error;
      }
    });
  };
  configure = (
    snapshot: SessionSnapshot,
    options: { limit?: number; enabled?: boolean },
  ): Promise<HistoryMetadata> => {
    const frame = captureJournalFrame(snapshot),
      id = crypto.randomUUID(),
      captured = { ...options },
      generation = this.generation;
    return this.enqueue(async () => {
      try {
        const { header } = await this.header(frame, generation);
        const result = await this.execute(
          {
            kind: "configure",
            ownNext: header.ownNext,
            operation: {
              id,
              epoch: header.meta.epoch!,
              configurationId: header.meta.configurationId,
            },
            options: captured,
          },
          frame,
        );
        if (captured.enabled && result.meta.enabled && result.meta.epoch === id)
          this.recovery.delete(frame.state.id);
        return this.remember(result, generation);
      } catch (error) {
        this.failed(frame.state.id);
        throw error;
      }
    });
  };
  drain = (): (() => void) => this.transport.drain();
  flush = async (): Promise<void> => {
    const release = this.drain();
    try {
      await this.tail;
    } finally {
      release();
    }
  };
  dispose = (): Promise<void> => {
    if (this.disposal) return this.disposal;
    this.closed = true;
    this.disposal = (async () => {
      const release = this.drain();
      try {
        await this.tail;
      } finally {
        release();
        this.transport.dispose();
        this.headers.clear();
        this.previousAt.clear();
        this.recovery.clear();
        await this.fallback?.dispose();
      }
    })();
    return this.disposal;
  };
}

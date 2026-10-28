import { computeCanonicalHash } from "./compute";
import { isPublishedComposition } from "@musart/core";
import { captureHashJob } from "./capture";
import { sendHashFragments } from "./transport";
import { logicalBytes } from "../../projects/logical-bytes";
import { isHashResponse, type CanonicalHashJob, type HashRequest } from "./protocol";

export interface HashWorkerPort {
  postMessage(message: HashRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
}
interface HashOptions {
  signal?: AbortSignal;
  isCurrent?: () => boolean;
  onPageBytes?: (bytes: number) => void;
}
interface Pending extends HashOptions {
  id: number;
  settled: boolean;
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
  abort: () => void;
  timer: ReturnType<typeof setTimeout>;
  transport: AbortController;
}

/** One owned worker, eight admitted snapshots, no originals or payload cache on the main thread. */
export class CanonicalHasher {
  private worker: HashWorkerPort | null | undefined;
  private readonly pending = new Map<number, Pending>();
  private sequence = 0;
  private closed = false;
  constructor(
    private readonly options: {
      createWorker?: () => HashWorkerPort | null;
      maxPending?: number;
      timeoutMs?: number;
      compute?: (job: CanonicalHashJob) => Promise<string>;
    } = {},
  ) {
    const limit = options.maxPending ?? 8,
      timeout = options.timeoutMs ?? 30000;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 8 ||
      !Number.isFinite(timeout) ||
      timeout <= 0
    )
      throw new Error("Invalid canonical hasher limits.");
  }
  private connect() {
    if (this.worker !== undefined) return this.worker;
    const worker = this.options.createWorker
      ? this.options.createWorker()
      : typeof Worker === "undefined"
        ? null
        : new Worker(new URL("./hash.worker.ts", import.meta.url), { type: "module" });
    this.worker = worker;
    if (worker) {
      worker.onmessage = ({ data }: MessageEvent<unknown>) => {
        if (!isHashResponse(data)) {
          this.fail(new Error("Invalid canonical hash worker response."));
          return;
        }
        const entry = this.pending.get(data.id);
        if (entry)
          this.finish(
            entry,
            "value" in data ? data.value : undefined,
            "error" in data ? new Error(data.error) : undefined,
            "pageBytes" in data ? data.pageBytes : undefined,
          );
      };
      worker.onerror = (event) =>
        this.fail(new Error(event.message || "Canonical hash worker failed."));
      worker.onmessageerror = () =>
        this.fail(new Error("Canonical hash worker message could not be decoded."));
    }
    return worker;
  }
  private release(entry: Pending) {
    entry.transport.abort();
    clearTimeout(entry.timer);
    entry.signal?.removeEventListener("abort", entry.abort);
    this.pending.delete(entry.id);
  }
  private finish(entry: Pending, value?: string, error?: unknown, pageBytes?: number) {
    this.release(entry);
    if (entry.settled) return;
    entry.settled = true;
    try {
      entry.signal?.throwIfAborted();
      if (entry.isCurrent && !entry.isCurrent())
        throw new DOMException("Canonical hash request is stale.", "AbortError");
      if (error !== undefined) throw error;
      if (pageBytes !== undefined) entry.onPageBytes?.(pageBytes);
      entry.resolve(value!);
    } catch (failure) {
      entry.reject(failure);
    }
  }
  private disconnect() {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
    }
    this.worker = undefined;
  }
  private fail(error: unknown) {
    this.disconnect();
    for (const entry of this.pending.values()) this.finish(entry, undefined, error);
  }
  hash = (job: CanonicalHashJob, options: HashOptions = {}): Promise<string> => {
    try {
      if (this.closed) throw new Error("Canonical hasher is disposed.");
      options.signal?.throwIfAborted();
      if (options.isCurrent && !options.isCurrent())
        throw new DOMException("Canonical hash request is stale.", "AbortError");
      if (this.pending.size >= (this.options.maxPending ?? 8))
        throw new Error("Canonical hash queue is full.");
      if (this.sequence >= Number.MAX_SAFE_INTEGER)
        throw new Error("Canonical hash sequence exhausted.");
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const entry: Pending = {
        ...options,
        id,
        settled: false,
        resolve,
        reject,
        abort: () => {
          if (entry.settled) return;
          entry.settled = true;
          entry.transport.abort();
          entry.reject(options.signal?.reason ?? new DOMException("Hash cancelled.", "AbortError"));
          entry.signal?.removeEventListener("abort", entry.abort);
          // Keep admission until the worker acknowledges, bounding physical cloned snapshots too.
          try {
            this.worker?.postMessage({ type: "cancel", id });
          } catch (error) {
            this.fail(error);
          }
        },
        timer: setTimeout(
          () => this.fail(new DOMException("Canonical hash timed out.", "TimeoutError")),
          this.options.timeoutMs ?? 30000,
        ),
        transport: new AbortController(),
      };
      this.pending.set(id, entry);
      entry.signal?.addEventListener("abort", entry.abort, { once: true });
      try {
        const worker = this.connect();
        if (worker) {
          if (job.kind === "thumbnail" && isPublishedComposition(job.page)) {
            const snapshot = captureHashJob(job);
            worker.postMessage({ type: "begin-hash", id });
            void sendHashFragments(
              worker,
              id,
              snapshot,
              entry.transport.signal,
              () => this.pending.get(id) === entry && (!entry.isCurrent || entry.isCurrent()),
            ).catch((error: unknown) => {
              if (this.pending.get(id) !== entry || entry.settled) return;
              entry.settled = true;
              entry.transport.abort();
              entry.reject(error);
              entry.signal?.removeEventListener("abort", entry.abort);
              // Keep physical admission until the incomplete remote assembly is acknowledged.
              try {
                worker.postMessage({ type: "cancel", id });
              } catch (failure) {
                this.fail(failure);
              }
            });
          } else {
            // External mutable inputs retain an immediate native call-time snapshot.
            worker.postMessage({ type: "hash", id, job });
          }
        } else {
          // No-Worker compatibility permits overlapping WebCrypto calls (including CAS races).
          const snapshot = structuredClone(job);
          void (this.options.compute ?? computeCanonicalHash)(snapshot).then(
            (value) => {
              if (this.pending.get(id) !== entry) return;
              try {
                this.finish(
                  entry,
                  value,
                  undefined,
                  snapshot.kind === "thumbnail" ? logicalBytes(snapshot.page) : undefined,
                );
              } catch (error) {
                this.finish(entry, undefined, error);
              }
            },
            (error: unknown) => {
              if (this.pending.get(id) === entry) this.finish(entry, undefined, error);
            },
          );
        }
      } catch (error) {
        this.finish(entry, undefined, error);
      }
    });
  };
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.fail(new DOMException("Canonical hasher disposed.", "AbortError"));
  }
}

import {
  compareMotionTime,
  motionTimeToSeconds,
  normalizeMotionTime,
  type MotionTime,
} from "@musart/core";
import { createMediabunnyVideoBackend } from "./backend";
import { VideoSourceError, videoSourceFailure } from "./errors";
import { VideoFramePool } from "./pool";
import type { VideoDecodedBudget } from "./budgets";
import type {
  DecodedVideoFrame,
  VideoDecodeBackend,
  VideoDecodeBackendFactory,
  VideoFrameLease,
  VideoSourceBudgets,
  VideoSourceIdentity,
  VideoSourceMetadata,
  VideoSourceStats,
} from "./model";

export interface VideoFrameSourceOptions extends VideoSourceIdentity {
  readonly original: Blob;
  readonly budgets?: Partial<VideoSourceBudgets>;
  /** Injectable native boundary for focused lifecycle tests; production uses Mediabunny. */
  readonly backendFactory?: VideoDecodeBackendFactory;
  readonly decodedBudget?: VideoDecodedBudget;
}

export interface VideoFrameRequestOptions {
  readonly mode?: "preview" | "exact";
  readonly signal?: AbortSignal;
}

interface Request {
  readonly requested: MotionTime;
  readonly sample: MotionTime;
  readonly seconds: number;
}
interface BackendHandle {
  readonly backend: VideoDecodeBackend;
  readonly close: () => Promise<void>;
}
interface Job {
  readonly request: Request;
  readonly resolve: (lease: VideoFrameLease | null) => void;
  readonly reject: (error: unknown) => void;
  finished: boolean;
  close: (() => Promise<void>) | null;
  detach: (() => void) | null;
}

const defaults: VideoSourceBudgets = Object.freeze({
  maxCachedFrames: 3,
  maxDecodedBytes: 256 * 1024 * 1024,
  maxFrameBytes: 64 * 1024 * 1024,
  maxSourceCacheBytes: 1024 * 1024,
  maxOpenBackends: 2,
  maxPendingExact: 2,
});

/** Original-only source. Preview has one active and one latest pending request; exact work is separate. */
export class VideoFrameSource {
  private readonly limits: VideoSourceBudgets;
  private readonly pool: VideoFramePool;
  private readonly factory: VideoDecodeBackendFactory;
  private readonly options: VideoFrameSourceOptions;
  private readonly cleanupFailures: unknown[] = [];
  private readonly handles = new Set<BackendHandle>();
  private readonly operations = new Set<Promise<void>>();
  private readonly exactQueue: Job[] = [];
  private activePreview: Job | null = null;
  private pendingPreview: Job | null = null;
  private activeExact: Job | null = null;
  private sequenceBusy = false;
  private metadataPromise: Promise<VideoSourceMetadata> | null = null;
  private closed = false;
  private disposal: Promise<void> | null = null;
  private peakBackends = 0;
  private cacheHits = 0;
  private decodedFrames = 0;
  private staleDiscards = 0;

  constructor(options: VideoFrameSourceOptions) {
    if (
      !options.assetId ||
      !options.contentRevision ||
      !options.original ||
      !Number.isSafeInteger(options.original.size)
    )
      throw new VideoSourceError(
        "unsupported",
        "Video source needs a durable identity, revision and original Blob.",
      );
    this.limits = Object.freeze({ ...defaults, ...options.budgets });
    this.options = Object.freeze({ ...options, budgets: this.limits });
    for (const [key, value] of Object.entries(this.limits))
      if (!Number.isSafeInteger(value) || value < (key === "maxCachedFrames" ? 0 : 1))
        throw new VideoSourceError(
          "budgetExceeded",
          "Video resource budgets must be positive safe integers.",
        );
    this.factory = options.backendFactory ?? createMediabunnyVideoBackend;
    this.pool = new VideoFramePool(
      { assetId: options.assetId, contentRevision: options.contentRevision },
      this.limits,
      options.decodedBudget,
    );
  }

  private assertOpen(): void {
    if (this.closed) throw new VideoSourceError("closed", "Video source is closed.");
  }

  private request(time: MotionTime): Request {
    const requested = Object.freeze(normalizeMotionTime(time));
    return { requested, sample: requested, seconds: motionTimeToSeconds(requested) };
  }

  private open(frameBytes = 0): BackendHandle {
    this.assertOpen();
    if (this.handles.size >= this.limits.maxOpenBackends)
      throw new VideoSourceError("busy", "Video decoder admission is full.");
    const release = this.pool.reserveDecoder(frameBytes);
    let backend: VideoDecodeBackend;
    try {
      backend = this.factory(this.options.original, this.limits.maxSourceCacheBytes);
    } catch (error) {
      release();
      throw error;
    }
    let closing: Promise<void> | null = null;
    const handle: BackendHandle = {
      backend,
      close: () => {
        if (closing) return closing;
        closing = Promise.resolve()
          .then(() => backend.dispose())
          .then(() => {
            this.handles.delete(handle);
            release();
          })
          .catch((error: unknown) => {
            // An unacknowledged native close retains its reservation and is reported explicitly.
            this.cleanupFailures.push(error);
          });
        return closing;
      },
    };
    this.handles.add(handle);
    this.peakBackends = Math.max(this.peakBackends, this.handles.size);
    return handle;
  }

  metadata(): Promise<VideoSourceMetadata> {
    this.assertOpen();
    if (!this.metadataPromise) {
      const handle = this.open();
      this.metadataPromise = (async () => {
        try {
          const metadata = await handle.backend.metadata();
          this.assertOpen();
          const bytes = metadata.codedWidth * metadata.codedHeight * 4;
          if (
            ![
              metadata.width,
              metadata.height,
              metadata.codedWidth,
              metadata.codedHeight,
              metadata.timeResolution,
            ].every((value) => Number.isSafeInteger(value) && value > 0)
          )
            throw new VideoSourceError(
              "unsupported",
              "Video metadata contains invalid dimensions or time resolution.",
            );
          if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > this.limits.maxFrameBytes)
            throw new VideoSourceError(
              "budgetExceeded",
              "Video dimensions exceed the frame budget.",
            );
          const firstTimestamp = Object.freeze(normalizeMotionTime(metadata.firstTimestamp));
          const endTimestamp = Object.freeze(normalizeMotionTime(metadata.endTimestamp));
          if (compareMotionTime(firstTimestamp, endTimestamp) >= 0)
            throw new VideoSourceError(
              "unsupported",
              "Video track has no positive presentation range.",
            );
          return Object.freeze({ ...metadata, firstTimestamp, endTimestamp });
        } catch (error) {
          throw videoSourceFailure(error);
        } finally {
          await handle.close();
        }
      })();
    }
    return this.metadataPromise;
  }

  stats(): VideoSourceStats {
    return Object.freeze({
      ...this.pool.stats(),
      openBackends: this.handles.size,
      peakOpenBackends: this.peakBackends,
      pendingPreview: Number(this.activePreview !== null) + Number(this.pendingPreview !== null),
      pendingExact:
        this.exactQueue.length + Number(this.activeExact !== null) + Number(this.sequenceBusy),
      cacheHits: this.cacheHits,
      decodedFrames: this.decodedFrames,
      staleDiscards: this.staleDiscards,
    });
  }

  private cancel(job: Job, code: "aborted" | "superseded" | "closed"): void {
    if (job.finished) return;
    job.finished = true;
    job.detach?.();
    job.detach = null;
    job.reject(new VideoSourceError(code, `Video request ${code}.`));
    void job.close?.();
    const queued = this.exactQueue.indexOf(job);
    if (queued !== -1) this.exactQueue.splice(queued, 1);
    if (this.pendingPreview === job) this.pendingPreview = null;
  }

  requestFrame(
    time: MotionTime,
    options: VideoFrameRequestOptions = {},
  ): Promise<VideoFrameLease | null> {
    this.assertOpen();
    if (options.mode !== undefined && options.mode !== "preview" && options.mode !== "exact")
      throw new VideoSourceError("unsupported", "Unknown video request mode.");
    const request = this.request(time);
    if (options.signal?.aborted)
      return Promise.reject(new VideoSourceError("aborted", "Video request was aborted."));
    const exact = options.mode === "exact";
    if (
      exact &&
      (this.sequenceBusy ||
        this.exactQueue.length + Number(this.activeExact !== null) >= this.limits.maxPendingExact)
    )
      return Promise.reject(new VideoSourceError("busy", "The exact video queue is full."));
    return new Promise((resolve, reject) => {
      const job: Job = { request, resolve, reject, finished: false, close: null, detach: null };
      if (options.signal) {
        const abort = () => this.cancel(job, "aborted");
        options.signal.addEventListener("abort", abort, { once: true });
        job.detach = () => options.signal!.removeEventListener("abort", abort);
      }
      if (exact) {
        this.exactQueue.push(job);
        this.drainExact();
      } else {
        if (this.pendingPreview) this.cancel(this.pendingPreview, "superseded");
        if (this.activePreview) this.cancel(this.activePreview, "superseded");
        let cached: VideoFrameLease | null;
        try {
          cached = this.pool.borrow(request.sample, request.requested);
        } catch (error) {
          job.finished = true;
          job.detach?.();
          job.detach = null;
          job.reject(videoSourceFailure(error));
          return;
        }
        if (cached) {
          this.cacheHits++;
          job.finished = true;
          job.detach?.();
          job.detach = null;
          job.resolve(cached);
          return;
        }
        this.pendingPreview = job;
        this.drainPreview();
      }
    });
  }

  private drainPreview(): void {
    if (this.closed || this.activePreview || !this.pendingPreview) return;
    const job = this.pendingPreview;
    this.pendingPreview = null;
    if (job.finished) return;
    this.activePreview = job;
    this.run(job, false);
  }

  private drainExact(): void {
    if (this.closed || this.activeExact || this.sequenceBusy) return;
    let job = this.exactQueue.shift();
    while (job?.finished) job = this.exactQueue.shift();
    if (!job) return;
    this.activeExact = job;
    this.run(job, true);
  }

  private run(job: Job, exact: boolean): void {
    const operation = (async () => {
      let handle: BackendHandle | null = null;
      try {
        const metadata = await this.metadata();
        if (job.finished) return;
        let lease = this.pool.borrow(job.request.sample, job.request.requested);
        if (lease) this.cacheHits++;
        else {
          handle = this.open(metadata.codedWidth * metadata.codedHeight * 4);
          job.close = handle.close;
          const decoded = await handle.backend.read(job.request.seconds);
          if (decoded) this.decodedFrames++;
          if (job.finished || this.closed) {
            if (decoded) {
              decoded.frame.close();
              this.staleDiscards++;
            }
            return;
          }
          lease = this.adopt(decoded, job.request, !exact);
        }
        job.finished = true;
        job.resolve(lease);
      } catch (error) {
        if (!job.finished) {
          job.finished = true;
          job.reject(videoSourceFailure(error));
        }
      } finally {
        job.detach?.();
        job.detach = null;
        job.close = null;
        await handle?.close();
        if (exact) {
          this.activeExact = null;
          this.drainExact();
        } else {
          this.activePreview = null;
          this.drainPreview();
        }
      }
    })();
    this.operations.add(operation);
    void operation.finally(() => this.operations.delete(operation)).catch(() => {});
  }

  private adopt(
    decoded: DecodedVideoFrame | null,
    request: Request,
    cache: boolean,
  ): VideoFrameLease | null {
    if (!decoded) return null;
    let covers: boolean;
    try {
      covers = this.pool.covers(decoded, request.sample);
    } catch (error) {
      decoded.frame.close();
      throw error;
    }
    if (!covers) {
      decoded.frame.close();
      return null;
    }
    return this.pool.adopt(decoded, request.requested, cache);
  }

  /** Exact bounded batches preserve source PTS order, including VFR/repeated frames and reverse jumps.
   * Mediabunny batches a GOP's requested timestamps internally; limiting each batch prevents an
   * unbounded duplicate-frame queue when callers request one source frame many times. */
  async *samples(
    times: Iterable<MotionTime> | AsyncIterable<MotionTime>,
    options: { signal?: AbortSignal } = {},
  ): AsyncGenerator<VideoFrameLease | null> {
    this.assertOpen();
    if (this.sequenceBusy || this.activeExact || this.exactQueue.length)
      throw new VideoSourceError(
        "busy",
        "Exact video decoder is already owned by another consumer.",
      );
    this.sequenceBusy = true;
    let handle: BackendHandle | null = null;
    const abort = () => {
      void handle?.close();
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    const check = () => {
      this.assertOpen();
      if (options.signal?.aborted)
        throw new VideoSourceError("aborted", "Video sequence was aborted.");
    };
    try {
      check();
      const metadata = await this.metadata();
      check();
      handle = this.open(metadata.codedWidth * metadata.codedHeight * 4);
      let batch: Request[] = [];
      for await (const time of times) {
        check();
        batch.push(this.request(time));
        if (batch.length === 4) {
          yield* this.batch(handle.backend, batch, check);
          batch = [];
        }
      }
      if (batch.length) yield* this.batch(handle.backend, batch, check);
    } catch (error) {
      throw videoSourceFailure(error);
    } finally {
      options.signal?.removeEventListener("abort", abort);
      await handle?.close();
      this.sequenceBusy = false;
      this.drainExact();
    }
  }

  private async *batch(
    backend: VideoDecodeBackend,
    requests: readonly Request[],
    check: () => void,
  ): AsyncGenerator<VideoFrameLease | null> {
    let index = 0;
    for await (const decoded of backend.batch(requests.map((request) => request.seconds))) {
      try {
        check();
      } catch (error) {
        decoded?.frame.close();
        throw error;
      }
      if (decoded) this.decodedFrames++;
      const request = requests[index++];
      if (!request) {
        decoded?.frame.close();
        throw new VideoSourceError("decodeFailed", "Video decoder returned extra samples.");
      }
      yield this.adopt(decoded, request, false);
    }
    if (index !== requests.length)
      throw new VideoSourceError("decodeFailed", "Video decoder returned an incomplete sequence.");
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.closed = true;
    if (this.pendingPreview) this.cancel(this.pendingPreview, "closed");
    if (this.activePreview) this.cancel(this.activePreview, "closed");
    if (this.activeExact) this.cancel(this.activeExact, "closed");
    for (const job of this.exactQueue.splice(0)) this.cancel(job, "closed");
    this.pendingPreview = null;
    this.exactQueue.length = 0;
    this.sequenceBusy = false;
    const closing = Array.from(this.handles, (handle) => handle.close());
    this.disposal = Promise.allSettled([...this.operations, ...closing]).then(async () => {
      await this.pool.close();
      if (this.cleanupFailures.length)
        throw new AggregateError(this.cleanupFailures, "Video source cleanup failed.");
    });
    return this.disposal;
  }
}

export function createVideoFrameSource(options: VideoFrameSourceOptions): VideoFrameSource {
  return new VideoFrameSource(options);
}

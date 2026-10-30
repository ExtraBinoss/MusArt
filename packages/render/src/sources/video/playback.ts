import {
  addMotionTime,
  compareMotionTime,
  motionTimeToSeconds,
  normalizeMotionTime,
  type MotionTime,
} from "@musart/core";
import { createMediabunnyVideoBackend } from "./backend";
import { VideoFramePool } from "./pool";
import { VideoSourceError, videoSourceFailure } from "./errors";
import type {
  VideoDecodeBackend,
  VideoFrameLease,
  VideoSourceBudgets,
  VideoSourceMetadata,
} from "./model";
import type { VideoFrameSourceOptions } from "./source";
const defaults: VideoSourceBudgets = {
  maxCachedFrames: 2,
  maxDecodedBytes: 96 * 1024 * 1024,
  maxFrameBytes: 32 * 1024 * 1024,
  maxSourceCacheBytes: 1024 * 1024,
  maxOpenBackends: 1,
  maxPendingExact: 1,
};

/** One presentation-order decoder cursor per playing layer. Reverse/loop creates a fresh cursor;
 * random scrub continues using the separately bounded latest-only frame source. */
export class VideoPlaybackCursor {
  private readonly backend: VideoDecodeBackend;
  private readonly pool: VideoFramePool;
  private readonly limits: VideoSourceBudgets;
  private readonly metadataPromise: Promise<VideoSourceMetadata>;
  private iterator: AsyncGenerator<import("./model").DecodedVideoFrame> | null = null;
  private previous: MotionTime | null = null;
  private futureStart: MotionTime | null = null;
  private releaseDecoder: (() => void) | null = null;
  private active: Promise<VideoFrameLease | null> | null = null;
  private closed = false;
  private disposal: Promise<void> | null = null;
  private decodedFrames = 0;
  private cacheHits = 0;
  private readonly cleanupFailures: unknown[] = [];
  constructor(options: VideoFrameSourceOptions) {
    this.limits = Object.freeze({ ...defaults, ...options.budgets });
    if (
      !options.assetId ||
      !options.contentRevision ||
      !options.original ||
      Object.values(this.limits).some((value) => !Number.isSafeInteger(value) || value < 1)
    )
      throw new VideoSourceError(
        "budgetExceeded",
        "Invalid playback source identity or resource bounds.",
      );
    this.pool = new VideoFramePool(options, this.limits, options.decodedBudget);
    this.backend = (options.backendFactory ?? createMediabunnyVideoBackend)(
      options.original,
      this.limits.maxSourceCacheBytes,
    );
    this.metadataPromise = this.backend.metadata().then((metadata) => {
      if (this.closed) throw new VideoSourceError("closed", "Playback cursor is closed.");
      const bytes = metadata.codedWidth * metadata.codedHeight * 4;
      if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > this.limits.maxFrameBytes)
        throw new VideoSourceError(
          "budgetExceeded",
          "Playback frame exceeds its native memory budget.",
        );
      this.releaseDecoder = this.pool.reserveDecoder(bytes);
      return metadata;
    });
    void this.metadataPromise.catch(() => {});
  }
  readTime(): MotionTime | null {
    return this.previous;
  }
  metadata(): Promise<VideoSourceMetadata> {
    return this.metadataPromise;
  }
  stats() {
    return {
      ...this.pool.stats(),
      decodedFrames: this.decodedFrames,
      cacheHits: this.cacheHits,
      active: this.active !== null,
      closed: this.closed,
    };
  }
  requestFrame(
    time: MotionTime,
    options: { signal?: AbortSignal } = {},
  ): Promise<VideoFrameLease | null> {
    if (this.closed)
      return Promise.reject(new VideoSourceError("closed", "Playback cursor is closed."));
    if (this.active)
      return Promise.reject(
        new VideoSourceError("busy", "Playback cursor already has an active sample request."),
      );
    const requested = Object.freeze(normalizeMotionTime(time)),
      sample = requested;
    if (this.previous && compareMotionTime(sample, this.previous) < 0)
      return Promise.reject(
        new VideoSourceError("unsupported", "Reverse playback requires a new source cursor."),
      );
    const abort = () => {
      void Promise.resolve()
        .then(() => this.backend.dispose())
        .catch((error: unknown) => {
          this.cleanupFailures.push(error);
        });
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    const check = () => {
      options.signal?.throwIfAborted();
      if (this.closed) throw new VideoSourceError("closed", "Playback cursor is closed.");
    };
    const operation = (async () => {
      check();
      const metadata = await this.metadataPromise;
      check();
      this.previous = sample;
      if (
        compareMotionTime(sample, metadata.firstTimestamp) < 0 ||
        compareMotionTime(sample, metadata.endTimestamp) >= 0
      )
        return null;
      const cached = this.pool.borrow(sample, requested);
      if (cached) {
        this.cacheHits++;
        return cached;
      }
      if (this.futureStart && compareMotionTime(sample, this.futureStart) < 0) return null;
      if (!this.iterator) {
        if (!this.backend.stream)
          throw new VideoSourceError("unsupported", "Sequential decoder streaming is unavailable.");
        this.iterator = this.backend.stream(motionTimeToSeconds(sample));
      }
      for (;;) {
        const next = await this.iterator.next();
        try {
          check();
        } catch (error) {
          if (!next.done) next.value.frame.close();
          throw error;
        }
        if (next.done) return null;
        const frame = next.value;
        this.decodedFrames++;
        if (compareMotionTime(sample, addMotionTime(frame.timestamp, frame.duration)) >= 0) {
          frame.frame.close();
          continue;
        }
        this.futureStart = frame.timestamp;
        if (compareMotionTime(sample, frame.timestamp) < 0) {
          // Retain one future sample for an actual VFR gap; it is accounted by the same bounded pool.
          this.pool.adopt(frame, frame.timestamp, true).release();
          return null;
        }
        return this.pool.adopt(frame, requested, true);
      }
    })()
      .catch((error: unknown) => {
        throw videoSourceFailure(error);
      })
      .finally(() => {
        options.signal?.removeEventListener("abort", abort);
        if (this.active === operation) this.active = null;
      });
    this.active = operation;
    return operation;
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.closed = true;
    this.disposal = (async () => {
      let acknowledged = false;
      try {
        // Backend cancellation returns iterators and closes its acknowledged native decoder.
        // It never drains the remaining video to EOF and does not free the reservation early.
        await this.backend.dispose();
        acknowledged = true;
        await this.active?.catch(() => {});
        await this.iterator?.return(undefined);
        if (this.cleanupFailures.length)
          throw new AggregateError(this.cleanupFailures, "Playback cleanup failed.");
      } finally {
        if (acknowledged) {
          this.releaseDecoder?.();
          this.releaseDecoder = null;
        }
        await this.pool.close();
      }
    })();
    return this.disposal;
  }
}

import { addMotionTime, compareMotionTime, type MotionTime } from "@musart/core";
import { VideoSourceError } from "./errors";
import type { VideoDecodedBudget } from "./budgets";
import type {
  DecodedVideoFrame,
  VideoFrameLease,
  VideoSourceBudgets,
  VideoSourceIdentity,
} from "./model";

interface CachedFrame {
  readonly decoded: DecodedVideoFrame;
  readonly bytes: number;
}

export class VideoFramePool {
  private readonly cache = new Map<string, CachedFrame>();
  private borrowed = 0;
  private heldBytes = 0;
  private cachedBytes = 0;
  private reservations = 0;
  private peak = 0;
  private closed = false;
  private drained: (() => void)[] = [];

  private readonly identity: VideoSourceIdentity;
  private readonly limits: VideoSourceBudgets;
  constructor(
    identity: VideoSourceIdentity,
    limits: VideoSourceBudgets,
    private readonly aggregate?: VideoDecodedBudget,
  ) {
    this.identity = Object.freeze({ ...identity });
    this.limits = Object.freeze({ ...limits });
  }

  private total(): number {
    return this.cachedBytes + this.heldBytes + this.reservations;
  }
  private account(): void {
    this.aggregate?.resize(this, this.total());
  }
  private fits(additional: number): boolean {
    return (
      this.total() + additional <= this.limits.maxDecodedBytes &&
      (this.aggregate?.fits(this, this.total() + additional) ?? true)
    );
  }

  stats() {
    return {
      cachedFrames: this.cache.size,
      borrowedFrames: this.borrowed,
      accountedFrameBytes: this.cachedBytes + this.heldBytes,
      decoderReservationBytes: this.reservations,
      peakAccountedBytes: this.peak,
    };
  }

  private fit(additional: number): void {
    while (this.cache.size && !this.fits(additional)) this.evict();
    if (!this.fits(additional))
      throw new VideoSourceError(
        "budgetExceeded",
        "Video decoded-frame budget is exhausted by active consumers.",
      );
    this.peak = Math.max(
      this.peak,
      this.cachedBytes + this.heldBytes + this.reservations + additional,
    );
  }

  private evict(): void {
    const first = this.cache.entries().next().value!;
    this.cache.delete(first[0]);
    this.cachedBytes -= first[1].bytes;
    this.account();
    first[1].decoded.frame.close();
  }

  reserveDecoder(frameBytes: number): () => void {
    if (this.closed) throw new VideoSourceError("closed", "Video frame pool is closed.");
    // Installed Mediabunny caps queued samples+decode requests at four. Native codec reference
    // surfaces remain browser-owned overhead and must also be measured in the native witness.
    const bytes = frameBytes * 4;
    this.fit(bytes);
    this.reservations += bytes;
    this.account();
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.reservations -= bytes;
        this.account();
      }
    };
  }

  covers(decoded: DecodedVideoFrame, time: MotionTime): boolean {
    return (
      compareMotionTime(time, decoded.timestamp) >= 0 &&
      compareMotionTime(time, addMotionTime(decoded.timestamp, decoded.duration)) < 0
    );
  }

  borrow(time: MotionTime, requestedTime: MotionTime): VideoFrameLease | null {
    for (const [key, cached] of this.cache) {
      if (!this.covers(cached.decoded, time)) continue;
      this.cache.delete(key);
      this.cachedBytes -= cached.bytes;
      this.account();
      try {
        this.fit(cached.bytes * 2);
        const frame = cached.decoded.frame.clone();
        this.cache.set(key, cached);
        this.cachedBytes += cached.bytes;
        this.account();
        return this.lease({ ...cached.decoded, frame }, cached.bytes, requestedTime);
      } catch (error) {
        this.cache.set(key, cached);
        this.cachedBytes += cached.bytes;
        this.account();
        throw error;
      }
    }
    return null;
  }

  adopt(decoded: DecodedVideoFrame, requestedTime: MotionTime, cache: boolean): VideoFrameLease {
    const bytes = decoded.frame.codedWidth * decoded.frame.codedHeight * 4;
    try {
      if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > this.limits.maxFrameBytes)
        throw new VideoSourceError(
          "budgetExceeded",
          "Decoded video frame exceeds the frame-size budget.",
        );
      if (this.closed) throw new VideoSourceError("closed", "Video frame pool is closed.");
      this.fit(bytes);
      if (!cache || this.limits.maxCachedFrames === 0)
        return this.lease(decoded, bytes, requestedTime);
      while (this.cache.size >= this.limits.maxCachedFrames) this.evict();
      const key = `${decoded.timestamp.value}/${decoded.timestamp.rate}`;
      const previous = this.cache.get(key);
      if (previous) {
        this.cache.delete(key);
        this.cachedBytes -= previous.bytes;
        this.account();
        previous.decoded.frame.close();
      }
      this.fit(bytes * 2);
      const cloned = decoded.frame.clone();
      this.cache.set(key, { decoded, bytes });
      this.cachedBytes += bytes;
      this.account();
      return this.lease({ ...decoded, frame: cloned }, bytes, requestedTime);
    } catch (error) {
      decoded.frame.close();
      throw error;
    }
  }

  private lease(
    decoded: DecodedVideoFrame,
    bytes: number,
    requestedTime: MotionTime,
  ): VideoFrameLease {
    this.borrowed++;
    this.heldBytes += bytes;
    this.account();
    let released = false;
    return Object.freeze({
      ...this.identity,
      ...decoded,
      requestedTime,
      release: () => {
        if (released) return;
        released = true;
        decoded.frame.close();
        this.borrowed--;
        this.heldBytes -= bytes;
        this.account();
        if (!this.borrowed) {
          for (const resolve of this.drained) resolve();
          this.drained = [];
        }
      },
    });
  }

  close(): Promise<void> {
    this.closed = true;
    while (this.cache.size) this.evict();
    return this.borrowed ? new Promise((resolve) => this.drained.push(resolve)) : Promise.resolve();
  }
}

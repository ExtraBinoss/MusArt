import { VideoSourceError } from "./errors";

export const VIDEO_MAX_STREAMS = 8;
export const VIDEO_DECODE_BYTES = 384 * 1024 * 1024;

/** Shared by all poster/playback pools of one compositor; codec-private surfaces are measured separately. */
export class VideoDecodedBudget {
  private readonly owners = new Map<object, number>();
  private bytes = 0;
  private peak = 0;
  constructor(readonly maxBytes = VIDEO_DECODE_BYTES) {}
  fits(owner: object, bytes: number): boolean {
    return this.bytes - (this.owners.get(owner) ?? 0) + bytes <= this.maxBytes;
  }
  resize(owner: object, bytes: number): void {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || !this.fits(owner, bytes))
      throw new VideoSourceError("budgetExceeded", "Composition decoded-video budget exceeded.");
    this.bytes += bytes - (this.owners.get(owner) ?? 0);
    if (bytes) this.owners.set(owner, bytes);
    else this.owners.delete(owner);
    this.peak = Math.max(this.peak, this.bytes);
  }
  stats() {
    return {
      bytes: this.bytes,
      peakBytes: this.peak,
      maxBytes: this.maxBytes,
      pools: this.owners.size,
    };
  }
}

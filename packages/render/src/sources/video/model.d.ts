import type { MotionTime } from "@musart/core";

export interface VideoSourceIdentity {
  readonly assetId: string;
  readonly contentRevision: string;
}

export interface VideoSourceBudgets {
  readonly maxCachedFrames: number;
  readonly maxDecodedBytes: number;
  readonly maxFrameBytes: number;
  readonly maxSourceCacheBytes: number;
  readonly maxOpenBackends: number;
  readonly maxPendingExact: number;
}

export interface VideoSourceMetadata {
  readonly codec: string;
  readonly width: number;
  readonly height: number;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly firstTimestamp: MotionTime;
  readonly endTimestamp: MotionTime;
  readonly timeResolution: number;
}

/** Logical source PTS in track ticks. Native VideoFrame microseconds are separate; no clip offset is applied. */
export interface DecodedVideoFrame {
  readonly frame: VideoFrame;
  readonly timestamp: MotionTime;
  readonly duration: MotionTime;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly flip: boolean;
  readonly pixelAspectRatio: { readonly numerator: number; readonly denominator: number };
}

export interface VideoFrameLease extends VideoSourceIdentity, Omit<DecodedVideoFrame, "frame"> {
  readonly requestedTime: MotionTime;
  readonly frame: VideoFrame;
  /** Idempotent. The consumer must wait for upload/render/encode consumption before releasing. */
  readonly release: () => void;
}

export interface VideoDecodeBackend {
  metadata(): Promise<VideoSourceMetadata>;
  read(seconds: number): Promise<DecodedVideoFrame | null>;
  batch(seconds: readonly number[]): AsyncGenerator<DecodedVideoFrame | null>;
  /** Optional sequential presentation-order stream. A cursor owns its bounded native decoder. */
  stream?(startSeconds: number): AsyncGenerator<DecodedVideoFrame>;
  dispose(): void | Promise<void>;
}

export type VideoDecodeBackendFactory = (
  original: Blob,
  sourceCacheBytes: number,
) => VideoDecodeBackend;

export interface VideoSourceStats {
  readonly cachedFrames: number;
  readonly borrowedFrames: number;
  readonly accountedFrameBytes: number;
  readonly decoderReservationBytes: number;
  readonly peakAccountedBytes: number;
  readonly openBackends: number;
  readonly peakOpenBackends: number;
  readonly pendingPreview: number;
  readonly pendingExact: number;
  readonly cacheHits: number;
  readonly decodedFrames: number;
  readonly staleDiscards: number;
}

export interface MotionPcmChunk {
  timestamp: number;
  sampleRate: number;
  channels: readonly Float32Array<ArrayBuffer>[];
  frames: number;
}
export interface MotionAudioSource {
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  /** Exact original PTS, never composition-relative time. Maximum one second per serial call. */
  readWindow(
    start: number,
    end: number,
    options?: { signal?: AbortSignal },
  ): Promise<readonly MotionPcmChunk[]>;
  dispose(): Promise<void>;
}

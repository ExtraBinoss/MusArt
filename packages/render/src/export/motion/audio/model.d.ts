import type { MotionProgram } from "@musart/core";

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
/** Serializable worker seam: timing/media only, with no visual properties or embedded images. */
export interface MotionAudioPlan {
  readonly mode: MotionProgram["mode"];
  readonly duration: MotionProgram["duration"];
  readonly layers: readonly Pick<MotionProgram["layers"][number], "start" | "end" | "media">[];
  readonly audio: readonly Pick<MotionProgram["audio"][number], "id" | "start" | "end" | "media">[];
}

import type { MotionFrameRate, MotionTime } from "@musart/core";
import type { StreamTargetChunk } from "mediabunny";
import type { MediaSourceResolver } from "../../sources/media/model";
import type { FontResolver } from "../../surface/text/fonts";

export interface MotionVideoExportOptions {
  compositionId: string;
  frameRate?: MotionFrameRate;
  scale?: number;
  container?: "auto" | "mp4" | "webm";
  alpha?: "discard" | "keep";
  /** Target video bits/second; default 8,000,000, variable bitrate. */
  videoBitrate?: number;
  /** Target audio bits/second; default 192,000. */
  audioBitrate?: number;
  mediaResolver?: MediaSourceResolver;
  fontResolver?: FontResolver;
  forceWebGL?: boolean;
  maxGpuBytes?: number;
  /** Checked before every write; default 128 MiB. Never silently truncates the output. */
  maxOutputBytes?: number;
  /** Default 1,000,000 frames, a work bound independent of the Timelapse duration limit. */
  maxFrames?: number;
  output?: WritableStream<StreamTargetChunk>;
  audio?: false | { sampleRate?: number; channels?: 1 | 2; blockFrames?: number };
  signal?: AbortSignal;
  onProgress?: (progress: {
    completedFrames: number;
    totalFrames: number;
    fraction: number;
  }) => void;
}
export interface MotionVideoExportResult {
  blob: Blob | null;
  mimeType: "video/mp4" | "video/webm";
  width: number;
  height: number;
  frameRate: MotionFrameRate;
  frameCount: number;
  /** Exact authored duration, before the container timestamp grid is applied. */
  duration: MotionTime;
  /** Encoded video end on its container grid; frame sampling remains authored/rational. */
  encodedDuration: MotionTime;
  timestampResolution: number;
  bytes: number;
  audio: { sampleRate: number; channels: number; samples: number } | null;
}

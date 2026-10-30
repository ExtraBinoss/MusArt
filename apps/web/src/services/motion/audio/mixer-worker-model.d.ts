import type { OriginalMediaAsset } from "@musart/core";
import type { MotionAudioPlan } from "@musart/render";
export interface AudioMixerMetadata {
  sampleRate: number;
  channels: 1 | 2;
  blockFrames: number;
  samples: number;
  hasAudio: boolean;
}
export type AudioMixerJob =
  | {
      type: "init";
      id: number;
      plan: MotionAudioPlan;
      assets: Record<string, OriginalMediaAsset>;
      options: {
        sampleRate?: number;
        channels?: 1 | 2;
        blockFrames?: number;
        clampOutput?: boolean;
        lazySources?: boolean;
        sourceReadAhead?: number;
      };
    }
  | { type: "read"; id: number; start: number; count: number }
  | { type: "volume"; id: number; trackId: string; volume: number | null }
  | { type: "mixState"; id: number; trackId: string; volume: number; mute: boolean }
  | { type: "original"; id: number; blob?: Blob; error?: string }
  | { type: "close"; id: number };
export type AudioMixerReply =
  | { type: "ready"; id: number; metadata: AudioMixerMetadata }
  | { type: "pcm"; id: number; pcm: Float32Array<ArrayBuffer>; hasAudio: boolean }
  | { type: "original"; id: number; assetId: string }
  | { type: "closed"; id: number }
  | { type: "updated"; id: number; hasAudio: boolean }
  | { type: "error"; id: number; message: string; code?: string };

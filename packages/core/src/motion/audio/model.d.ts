import type { AudioAsset } from "../../assets/model";
import type { MotionTime } from "../time";

export interface MotionAudioTrack {
  id: string;
  name: string;
  assetId: string;
  start: MotionTime;
  end: MotionTime;
  /** Relative to the original's first PTS; trimming the left edge preserves source alignment. */
  sourceIn: MotionTime;
  mute: boolean;
  volume: number;
  processing?: MotionAudioProcessing;
}

/** Clip-relative fades and a finite, deterministic diffuse room response. */
export interface MotionAudioProcessing {
  fadeIn: MotionTime;
  fadeOut: MotionTime;
  reverb: { mix: number; decay: number };
}

export type MotionAudioCommand =
  | { type: "addMotionAudioTrack"; track: MotionAudioTrack; asset?: AudioAsset }
  | { type: "moveMotionAudioTrack"; trackId: string; delta: MotionTime }
  | { type: "setMotionAudioTrackRange"; trackId: string; start: MotionTime; end: MotionTime }
  | {
      type: "updateMotionAudioTrack";
      trackId: string;
      patch: Partial<
        Pick<MotionAudioTrack, "name" | "mute" | "volume" | "sourceIn" | "processing">
      >;
    }
  | { type: "deleteMotionAudioTrack"; trackId: string };

import type { MotionTime, MotionFrameRate } from "./time";
import type { MotionEasing } from "./easing";
import type { MotionPropertyTarget, MotionValue } from "./properties/model";
import type { MotionAudioTrack, MotionAudioCommand } from "./audio/model";

export interface MotionKeyframe {
  id: string;
  /** Composition-relative time; v2 permits signed pre-roll. Trimming retains off-range keys. */
  time: MotionTime;
  value: MotionValue;
  /** The destination key controls its incoming segment. */
  easing?: MotionEasing;
}

export interface MotionPropertyTrack {
  id: string;
  target: MotionPropertyTarget;
  keyframes: MotionKeyframe[];
}

/** One independent occurrence; several disjoint tracks may share a canonical layerId in v2. */
export interface MotionLayerTrack {
  id: string;
  layerId: string;
  start: MotionTime;
  /** null follows the composition end; an explicit trim remains fixed. */
  end: MotionTime | null;
  properties: MotionPropertyTrack[];
  /** Source in-point is relative to the video's first PTS; audio shares this same placement. */
  media?: { sourceIn: MotionTime; mute: boolean; volume: number };
}

export interface CompositionMotion {
  version: 1 | 2;
  /** Retained even when Static or when every track is empty. */
  initialized: true;
  mode: "static" | "motion";
  duration: MotionTime;
  frameRate: MotionFrameRate;
  tracks: MotionLayerTrack[];
  /** Independent sound clips do not create visual layers or GPU resources. */
  audioTracks?: MotionAudioTrack[];
}

export interface MotionInitializationPlan {
  compositionId: string;
  revision: number;
  layerIds: string[];
  duration: MotionTime;
  frameRate: MotionFrameRate;
  requiresConfirmation: boolean;
}

export type MotionCommand =
  | MotionAudioCommand
  | {
      type: "setCompositionMode";
      mode: "static" | "motion";
      plan?: MotionInitializationPlan;
      confirmed?: boolean;
    }
  | { type: "setMotionDuration"; duration: MotionTime }
  | { type: "addMotionOccurrence"; layerId: string; start: MotionTime; end: MotionTime | null }
  | { type: "duplicateMotionOccurrence"; trackId: string; start: MotionTime; end?: MotionTime }
  | { type: "deleteMotionOccurrence"; trackId: string }
  | { type: "setMotionTrackRange"; trackId: string; start: MotionTime; end: MotionTime | null }
  | {
      type: "setMotionMedia";
      trackId: string;
      patch: Partial<NonNullable<MotionLayerTrack["media"]>>;
    }
  | {
      type: "upsertMotionKeyframe";
      /** Required to edit a chosen repeated occurrence; omitted legacy calls resolve at time. */
      trackId?: string;
      target: MotionPropertyTarget;
      time: MotionTime;
      value: MotionValue;
      easing?: MotionEasing;
    }
  | { type: "moveMotionKeyframe"; keyframeId: string; time: MotionTime }
  | { type: "deleteMotionKeyframe"; keyframeId: string }
  | { type: "moveMotionTrack"; trackId: string; delta: MotionTime }
  | { type: "moveMotionKeyframes"; keyframeIds: string[]; delta: MotionTime }
  | { type: "deleteMotionKeyframes"; keyframeIds: string[] };

import type { MotionTime, MotionFrameRate } from "./time";
import type { MotionEasing } from "./easing";
import type { MotionPropertyTarget, MotionValue } from "./properties/model";

export interface MotionKeyframe {
  id: string;
  /** Composition-relative time. Trimming never discards off-range keys. */
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

export interface MotionLayerTrack {
  id: string;
  layerId: string;
  start: MotionTime;
  /** null follows the composition end; an explicit trim remains fixed. */
  end: MotionTime | null;
  properties: MotionPropertyTrack[];
}

export interface CompositionMotion {
  version: 1;
  /** Retained even when Static or when every track is empty. */
  initialized: true;
  mode: "static" | "motion";
  duration: MotionTime;
  frameRate: MotionFrameRate;
  tracks: MotionLayerTrack[];
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
  | {
      type: "setCompositionMode";
      mode: "static" | "motion";
      plan?: MotionInitializationPlan;
      confirmed?: boolean;
    }
  | { type: "setMotionDuration"; duration: MotionTime }
  | { type: "setMotionTrackRange"; trackId: string; start: MotionTime; end: MotionTime | null }
  | {
      type: "upsertMotionKeyframe";
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

import type { Effect, Layer } from "../../document/model";
import type { MotionEasing } from "../easing";
import type { LayerMotionProperty, EffectMotionProperty, MotionValue } from "../properties/model";
import type { MotionTime } from "../time";

export type AnimationCategory =
  | "move"
  | "scale"
  | "rotate"
  | "blur"
  | "attention"
  | "reveal"
  | "stylize"
  | "custom";
export type AnimationTarget =
  | { kind: "layer"; property: LayerMotionProperty }
  | { kind: "effect"; slot: number; property: EffectMotionProperty }
  | { kind: "effectSetting"; slot: number; property: string };
export interface AnimationPoint {
  /** Local normalized time, independent of frame rate and target duration. */
  at: number;
  value: MotionValue;
  easing?: MotionEasing;
}
export interface AnimationChannel {
  target: AnimationTarget;
  operation: "add" | "multiply" | "replace";
  /** Relative distances adapt to the target, including the shared preview image. */
  unit?: "width" | "height";
  points: AnimationPoint[];
}
export interface MotionAnimationPreset {
  version: 1;
  id: string;
  name: string;
  category: AnimationCategory;
  duration: number;
  channels: AnimationChannel[];
  effects: Omit<Effect, "id">[];
}
/** Self-contained, declarative instances. Channels have exactly one authoritative owner. */
export interface MotionAnimation {
  id: string;
  preset: MotionAnimationPreset;
  start: MotionTime;
  duration: MotionTime;
  strength: number;
  enabled: boolean;
  effectIds: string[];
}
export type MotionAnimationCommand =
  | {
      type: "addMotionAnimation";
      trackId: string;
      preset: MotionAnimationPreset;
      start: MotionTime;
      duration?: MotionTime;
      strength?: number;
      enabled?: boolean;
    }
  | {
      type: "updateMotionAnimation";
      animationId: string;
      patch: Partial<
        Pick<MotionAnimation, "start" | "duration" | "strength" | "enabled" | "preset">
      >;
    }
  | { type: "deleteMotionAnimation"; animationId: string };
export type AnimationSubject = Pick<Layer, "id" | "width" | "height">;

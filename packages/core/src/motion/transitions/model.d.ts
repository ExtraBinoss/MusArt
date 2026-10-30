import type { TransitionStyle } from "../../effects/transition/catalog";
import type { MotionTime } from "../time";
import type { MotionEasing } from "../easing";

export interface ApplyMotionTransitionCommand {
  type: "applyMotionTransition";
  layerId: string;
  /** Select one occurrence when this canonical layer appears repeatedly. */
  trackId?: string;
  style: TransitionStyle;
  placement: "in" | "out";
  duration: MotionTime;
  easing?: MotionEasing;
  direction?: "left" | "right" | "up" | "down";
  /** Replace a chosen transition and its progress keys, rather than stacking another. */
  effectId?: string;
}

import type { Layer } from "@musart/core";
import type { MarqueeScope } from "../selection/marquee-scope";
import type { Point, View } from "../viewport/view";
import type { Handle } from "./gestures";
import type { TransformGesture } from "./snapping/use-transform-snapping";

export interface Gesture extends TransformGesture, MarqueeScope {
  pointerId: number;
  mode: "pan" | "move" | "resize" | "box" | "draw";
  view: View;
  layers: Layer[];
  handle?: Handle;
  shape?: Layer;
  current: Point;
  boxStarted?: boolean;
}

import type { Bounds, Point } from "../../layers/geometry";
import type { MeasurementArrow } from "../measurements";
export type SnapKind = "guide" | "margin" | "layer" | "page";
export interface SnapTarget {
  axis: "x" | "y";
  value: number;
  min: number;
  max: number;
  id: string;
  kind: SnapKind;
  color?: string;
}
export interface SnapCue {
  axis: "x" | "y";
  position: number;
  from: Point;
  to: Point;
  targetId: string;
  kind: SnapKind;
  color?: string;
  gap?: MeasurementArrow;
}
export interface SnapResult {
  delta: Point;
  bounds: Bounds;
  cues: readonly SnapCue[];
  /** Actual bounded candidate inspections, for headless performance diagnostics. */
  checks: number;
}
export interface AxisMatch {
  target: SnapTarget;
  correction: number;
}

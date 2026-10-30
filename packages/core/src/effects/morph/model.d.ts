export type MorphPoint = readonly [number, number];
export interface MorphContour {
  hole: boolean;
  points: MorphPoint[];
}
export interface MorphShapeFrame {
  at: number;
  /** Placement relative to the layer, with local normalized closed contours. */
  box: [number, number, number, number];
  contours: MorphContour[];
  easing?: "linear" | "easeOut" | "easeInOut";
}
export interface ShapeMorph {
  version: 1;
  /** Custom text contours rebase to generated glyphs when the content is edited. */
  sourceText?: string;
  sourceFont?: { family: string; size: number; weight: number };
  shapes: { frames: MorphShapeFrame[] }[];
}

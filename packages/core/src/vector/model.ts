export interface VectorPart {
  path: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  fillRule?: "nonzero" | "evenodd";
  linecap?: "butt" | "round" | "square";
  linejoin?: "miter" | "round" | "bevel";
  matrix?: [number, number, number, number, number, number];
}
/** Portable Resumi geometry: paths remain editable data rather than imported raster images. */
export interface VectorDefinition {
  viewBox: string;
  path?: string;
  parts?: VectorPart[];
  strokeOnly?: boolean;
  attribution?: string;
  preserveColors?: boolean;
}

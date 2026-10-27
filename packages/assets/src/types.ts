export type AssetKind = "shapes" | "icons" | "brands";
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
export interface VectorArtwork {
  viewBox: string;
  path?: string;
  strokeOnly?: boolean;
  parts?: VectorPart[];
  attribution?: string;
  preserveColors?: boolean;
}
export interface CatalogAsset extends VectorArtwork {
  id: string;
  name: string;
  category?: string;
  source?: string;
  license?: string;
  aspectRatio?: number;
}

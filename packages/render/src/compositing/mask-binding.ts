import {
  getAncestors,
  getWorldMatrix,
  invertMatrix,
  multiplyMatrices,
  type Composition,
  type Layer,
  type Matrix,
} from "@musart/core";
export interface MaskMapping {
  matrix: Matrix;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  opacity: number;
  premultiplied: boolean;
  luminance: boolean;
  transformed: boolean;
}
export function maskLayerMapping(
  page: Composition,
  target: Layer,
  source: Layer,
  premultiplied: boolean,
): MaskMapping {
  const lineage = [...getAncestors(page, source.id), source];
  const opacity = lineage.reduce((alpha, layer) => (layer.visible ? alpha * layer.opacity : 0), 1);
  return {
    matrix: multiplyMatrices(
      invertMatrix(getWorldMatrix(page, source.id)),
      getWorldMatrix(page, target.id),
    ),
    sourceWidth: source.width,
    sourceHeight: source.height,
    targetWidth: target.width,
    targetHeight: target.height,
    opacity,
    premultiplied,
    luminance: target.mask?.mode === "luminance",
    transformed: true,
  };
}

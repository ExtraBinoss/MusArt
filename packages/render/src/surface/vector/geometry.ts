import type { Layer, VectorDefinition, VectorPart } from "@musart/core";
import { Matrix4, ShapeGeometry, type BufferGeometry } from "three/webgpu";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
export interface VectorGeometryPart {
  geometry: BufferGeometry;
  part: VectorPart;
  kind: "fill" | "stroke";
  partIndex: number;
}
export function vectorParts(vector: VectorDefinition): VectorPart[] {
  return vector.parts ?? [{ path: vector.path ?? "" }];
}
export function strokeWidth(layer: Layer, part: VectorPart): number {
  return layer.vector?.preserveColors
    ? (part.strokeWidth ?? (layer.strokeWidth || 1))
    : layer.strokeWidth > 0
      ? layer.strokeWidth
      : (part.strokeWidth ?? 2);
}
export function hasFill(layer: Layer, part: VectorPart): boolean {
  return !layer.vector?.strokeOnly && part.fill !== "none";
}
export function hasStroke(layer: Layer, part: VectorPart): boolean {
  return (
    part.stroke !== "none" && (!!layer.vector?.strokeOnly || !!part.stroke || layer.strokeWidth > 0)
  );
}
export function vectorGeometryKey(layer: Layer): string {
  if (!layer.vector) throw new Error("Géométrie vectorielle absente.");
  return JSON.stringify([
    layer.vector.viewBox,
    vectorParts(layer.vector).map((part) => [
      part.path,
      part.matrix,
      part.fillRule,
      part.linecap,
      part.linejoin,
      hasFill(layer, part),
      hasStroke(layer, part),
      hasStroke(layer, part) ? strokeWidth(layer, part) : 0,
    ]),
  ]);
}
function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
export function parseVectorGeometry(layer: Layer): VectorGeometryPart[] {
  if (!layer.vector) throw new Error("Géométrie vectorielle absente.");
  const result: VectorGeometryPart[] = [];
  try {
    for (const [partIndex, part] of vectorParts(layer.vector).entries()) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escape(layer.vector.viewBox)}"><path d="${escape(part.path)}" fill-rule="${part.fillRule ?? "nonzero"}"/></svg>`;
      const parsed = new SVGLoader().parse(svg);
      for (const path of parsed.paths) {
        if (hasFill(layer, part)) {
          const shapes = path.toShapes();
          if (shapes.length)
            result.push({ geometry: new ShapeGeometry(shapes, 24), part, partIndex, kind: "fill" });
        }
        if (hasStroke(layer, part)) {
          const style = SVGLoader.getStrokeStyle(
            strokeWidth(layer, part),
            "#ffffff",
            part.linejoin ?? "round",
            part.linecap ?? "round",
          );
          for (const subpath of path.subPaths) {
            const points = subpath.getPoints(48);
            if (points.length < 2) continue;
            const geometry = SVGLoader.pointsToStroke(points, style, 12, 0.0001);
            if (geometry) result.push({ geometry, part, partIndex, kind: "stroke" });
          }
        }
      }
    }
    for (const item of result)
      if (item.part.matrix) {
        const [a, b, c, d, e, f] = item.part.matrix;
        item.geometry.applyMatrix4(
          new Matrix4().set(a, c, 0, e, b, d, 0, f, 0, 0, 1, 0, 0, 0, 0, 1),
        );
      }
    return result;
  } catch (error) {
    for (const item of result) item.geometry.dispose();
    throw error;
  }
}

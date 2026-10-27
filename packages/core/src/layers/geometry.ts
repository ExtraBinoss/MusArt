import { ensure } from "../errors";
import type { Composition, Layer } from "../document/model";

export interface Point {
  x: number;
  y: number;
}
export interface Bounds extends Point {
  width: number;
  height: number;
}
export type Matrix = readonly [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiplyMatrices(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function transformPoint(matrix: Matrix, point: Point): Point {
  return {
    x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
    y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
  };
}
export function invertMatrix(matrix: Matrix): Matrix {
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  ensure(Math.abs(determinant) > 1e-12, "INVALID_COMMAND", "Transformation non inversible");
  return [
    matrix[3] / determinant,
    -matrix[1] / determinant,
    -matrix[2] / determinant,
    matrix[0] / determinant,
    (matrix[2] * matrix[5] - matrix[3] * matrix[4]) / determinant,
    (matrix[1] * matrix[4] - matrix[0] * matrix[5]) / determinant,
  ];
}
export function layerTransform(layer: Layer): Matrix {
  const radians = (layer.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const cx = layer.width / 2;
  const cy = layer.height / 2;
  return [
    cosine,
    sine,
    -sine,
    cosine,
    layer.x + cx - cosine * cx + sine * cy,
    layer.y + cy - sine * cx - cosine * cy,
  ];
}
export function getAncestors(page: Composition, layerId: string): Layer[] {
  const byId = new Map(page.layers.map((layer) => [layer.id, layer]));
  const ancestors: Layer[] = [];
  let layer = byId.get(layerId);
  const seen = new Set<string>([layerId]);
  while (layer?.parentId) {
    ensure(!seen.has(layer.parentId), "INVALID_HIERARCHY", "Cycle de parenté");
    seen.add(layer.parentId);
    layer = byId.get(layer.parentId);
    ensure(layer, "NOT_FOUND", "Parent introuvable");
    ancestors.unshift(layer);
  }
  return ancestors;
}
export function getDescendants(page: Composition, ids: readonly string[]): Layer[] {
  const included = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const layer of page.layers) {
      if (layer.parentId && included.has(layer.parentId) && !included.has(layer.id)) {
        included.add(layer.id);
        changed = true;
      }
    }
  }
  return page.layers.filter((layer) => included.has(layer.id));
}
export function getWorldMatrix(page: Composition, layerId: string): Matrix {
  const layer = page.layers.find((item) => item.id === layerId);
  ensure(layer, "NOT_FOUND", "Calque introuvable");
  return [...getAncestors(page, layerId), layer].reduce<Matrix>(
    (matrix, item) => multiplyMatrices(matrix, layerTransform(item)),
    IDENTITY,
  );
}
export function getWorldBounds(page: Composition, layerId: string): Bounds {
  const layer = page.layers.find((item) => item.id === layerId);
  ensure(layer, "NOT_FOUND", "Calque introuvable");
  const matrix = getWorldMatrix(page, layerId);
  const corners = [
    { x: 0, y: 0 },
    { x: layer.width, y: 0 },
    { x: layer.width, y: layer.height },
    { x: 0, y: layer.height },
  ].map((point) => transformPoint(matrix, point));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
export function hitTest(page: Composition, point: Point): Layer | null {
  function visit(parentId: string | null, matrix: Matrix): Layer | null {
    const children = page.layers.filter((layer) => layer.parentId === parentId);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const layer = children[index];
      if (!layer || layer.maskSource || !layer.visible || layer.locked || layer.opacity === 0)
        continue;
      const world = multiplyMatrices(matrix, layerTransform(layer));
      const local = transformPoint(invertMatrix(world), point);
      if (local.x < 0 || local.y < 0 || local.x > layer.width || local.y > layer.height) continue;
      if (
        layer.kind === "ellipse" &&
        ((local.x - layer.width / 2) / (layer.width / 2)) ** 2 +
          ((local.y - layer.height / 2) / (layer.height / 2)) ** 2 >
          1
      )
        continue;
      if (layer.kind === "group") {
        const hit = visit(layer.id, world);
        if (hit) return hit;
      }
      return layer;
    }
    return null;
  }
  return visit(null, IDENTITY);
}
export function snap(value: number, targets: readonly number[], threshold = 6): number {
  let result = value;
  let distance = threshold;
  for (const target of targets) {
    const candidate = Math.abs(target - value);
    if (candidate <= distance) {
      distance = candidate;
      result = target;
    }
  }
  return result;
}

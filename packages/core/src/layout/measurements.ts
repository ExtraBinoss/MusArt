import type { Composition, Layer } from "../document/model";
import { createLayerGeometryIndex, type LayerGeometryIndex } from "../layers/geometry-index";
import { transformPoint, type Bounds, type Point } from "../layers/geometry";
import { ZERO_INSETS } from "./model";
export interface MeasurementArrow {
  axis: "x" | "y";
  from: Point;
  to: Point;
  value: number;
}
export interface LayerMeasurement {
  layerId: string;
  bounds: Bounds;
  content: Bounds;
  outer: Bounds;
  distances: { left: number; top: number; right: number; bottom: number };
  arrows: MeasurementArrow[];
}
export function layoutBoxes(layer: Layer): { border: Bounds; content: Bounds; outer: Bounds } {
  const p = layer.padding ?? ZERO_INSETS,
    m = layer.margin ?? ZERO_INSETS;
  return {
    border: { x: 0, y: 0, width: layer.width, height: layer.height },
    content: {
      x: p.left,
      y: p.top,
      width: Math.max(0, layer.width - p.left - p.right),
      height: Math.max(0, layer.height - p.top - p.bottom),
    },
    outer: {
      x: -m.left,
      y: -m.top,
      width: layer.width + m.left + m.right,
      height: layer.height + m.top + m.bottom,
    },
  };
}
function worldBox(geometry: LayerGeometryIndex, id: string, box: Bounds): Bounds {
  const matrix = geometry.worldMatrix(id),
    points = [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
      { x: box.x, y: box.y + box.height },
    ].map((point) => transformPoint(matrix, point)),
    x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p.x)) - x,
    height: Math.max(...points.map((p) => p.y)) - y,
  };
}
export function measureLayer(
  page: Composition,
  id: string,
  geometry: LayerGeometryIndex = createLayerGeometryIndex(page),
): LayerMeasurement {
  const layer = geometry.get(id),
    parent = layer.parentId ? geometry.get(layer.parentId) : page,
    boxes = layoutBoxes(layer),
    distances = {
      left: layer.x,
      top: layer.y,
      right: parent.width - layer.x - layer.width,
      bottom: parent.height - layer.y - layer.height,
    };
  const parentPoint = (point: Point) =>
    layer.parentId ? transformPoint(geometry.worldMatrix(layer.parentId), point) : point;
  const spacing = layer.parentId
    ? (geometry.get(layer.parentId).padding ?? ZERO_INSETS)
    : (page.margins ?? ZERO_INSETS);
  distances.left -= spacing.left;
  distances.right -= spacing.right;
  distances.top -= spacing.top;
  distances.bottom -= spacing.bottom;
  const cx = layer.x + layer.width / 2,
    cy = layer.y + layer.height / 2;
  return {
    layerId: id,
    bounds: { ...geometry.worldBounds(id) },
    content: worldBox(geometry, id, boxes.content),
    outer: worldBox(geometry, id, boxes.outer),
    distances,
    arrows: [
      {
        axis: "x",
        from: parentPoint({ x: spacing.left, y: cy }),
        to: parentPoint({ x: layer.x, y: cy }),
        value: distances.left,
      },
      {
        axis: "x",
        from: parentPoint({ x: layer.x + layer.width, y: cy }),
        to: parentPoint({ x: parent.width - spacing.right, y: cy }),
        value: distances.right,
      },
      {
        axis: "y",
        from: parentPoint({ x: cx, y: spacing.top }),
        to: parentPoint({ x: cx, y: layer.y }),
        value: distances.top,
      },
      {
        axis: "y",
        from: parentPoint({ x: cx, y: layer.y + layer.height }),
        to: parentPoint({ x: cx, y: parent.height - spacing.bottom }),
        value: distances.bottom,
      },
    ],
  };
}

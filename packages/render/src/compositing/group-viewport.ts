import {
  invertMatrix,
  layerTransform,
  transformPoint,
  type Bounds,
  type Layer,
} from "@musart/core";
import { rasterExtent } from "./types";

export interface GroupViewport {
  bounds: Bounds;
  pixelWidth: number;
  pixelHeight: number;
  empty: boolean;
  key: string;
}
const edge = (value: number, round: (value: number) => number) => {
  const integer = Math.round(value);
  return Math.abs(value - integer) <= Number.EPSILON * 64 * Math.max(1, Math.abs(value))
    ? integer
    : round(value);
};

/** Only transport containers use this window. Treatments/mask sources keep their full domain. */
export function groupViewport(layer: Layer, scale: number, parent?: Bounds): GroupViewport | null {
  if (!parent) return null;
  const inverse = invertMatrix(layerTransform(layer));
  const corners = [
    { x: parent.x, y: parent.y },
    { x: parent.x + parent.width, y: parent.y },
    { x: parent.x + parent.width, y: parent.y + parent.height },
    { x: parent.x, y: parent.y + parent.height },
  ].map((point) => transformPoint(inverse, point));
  const minX = Math.max(0, Math.min(...corners.map((point) => point.x))),
    minY = Math.max(0, Math.min(...corners.map((point) => point.y))),
    maxX = Math.min(layer.width, Math.max(...corners.map((point) => point.x))),
    maxY = Math.min(layer.height, Math.max(...corners.map((point) => point.y)));
  const empty = maxX <= minX || maxY <= minY;
  const fullWidth = rasterExtent(layer.width, scale),
    fullHeight = rasterExtent(layer.height, scale);
  // Preserve the original container's texel grid, not just the nominal density.
  // One transparent texel protects bilinear reconstruction at a cropped boundary.
  const left = empty ? 0 : Math.max(0, edge((minX / layer.width) * fullWidth, Math.floor) - 1),
    top = empty ? 0 : Math.max(0, edge((minY / layer.height) * fullHeight, Math.floor) - 1),
    right = empty ? 1 : Math.min(fullWidth, edge((maxX / layer.width) * fullWidth, Math.ceil) + 1),
    bottom = empty
      ? 1
      : Math.min(fullHeight, edge((maxY / layer.height) * fullHeight, Math.ceil) + 1);
  if (!empty && left === 0 && top === 0 && right === fullWidth && bottom === fullHeight)
    return null;
  return {
    bounds: {
      x: (left * layer.width) / fullWidth,
      y: (top * layer.height) / fullHeight,
      width: ((right - left) * layer.width) / fullWidth,
      height: ((bottom - top) * layer.height) / fullHeight,
    },
    pixelWidth: right - left,
    pixelHeight: bottom - top,
    empty,
    key: [left, top, right, bottom, Number(empty)].join(","),
  };
}

/** A presentation quad may cover a subrectangle without changing its authored source layer. */
export function sourcePlacement(
  layer: Layer,
  bounds?: Bounds,
  parent?: Pick<Bounds, "x" | "y">,
): Layer {
  const x = parent?.x ?? 0,
    y = parent?.y ?? 0;
  if (!bounds) return x || y ? { ...layer, x: layer.x - x, y: layer.y - y } : layer;
  const center = transformPoint(layerTransform(layer), {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  });
  return {
    ...layer,
    x: center.x - bounds.width / 2 - x,
    y: center.y - bounds.height / 2 - y,
    width: bounds.width,
    height: bounds.height,
  };
}

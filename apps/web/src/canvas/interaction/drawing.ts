import type { Layer } from "@musart/core";
import type { Point } from "../viewport/view";

/** Text frames remain rectangular; Shift constrains geometric shapes only. */
export function resizeDrawing(layer: Layer, from: Point, to: Point, square: boolean): Layer {
  const width = Math.max(1, Math.abs(to.x - from.x));
  const height = square && layer.kind !== "text" ? width : Math.max(1, Math.abs(to.y - from.y));
  return {
    ...layer,
    x: to.x < from.x ? from.x - width : from.x,
    y: to.y < from.y ? from.y - height : from.y,
    width,
    height,
  };
}

export function completeDrawing(layer: Layer, dragged: boolean): Layer {
  if (layer.kind === "text") return dragged ? layer : { ...layer, width: 360, height: 100 };
  return layer.width > 3 && layer.height > 3 ? layer : { ...layer, width: 180, height: 140 };
}

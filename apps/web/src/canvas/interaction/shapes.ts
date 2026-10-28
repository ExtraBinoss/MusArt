import { createLayer, type Layer } from "@musart/core";
import type { CatalogAsset } from "@musart/assets";
import { vectorFromAsset } from "../../components/assets/selection";
import type { Point } from "../viewport/view";

export function createArtworkLayer(item: CatalogAsset, point: Point): Layer {
  const kind = item.id === "rectangle" ? "rectangle" : item.id === "circle" ? "ellipse" : "vector";
  return createLayer(kind, {
    name: item.name,
    x: point.x,
    y: point.y,
    width: 1,
    height: 1,
    fill: "#2563eb",
    radius: kind === "rectangle" ? 12 : 0,
    ...(kind === "vector" ? { vector: vectorFromAsset(item) } : {}),
    ...(item.strokeOnly ? { stroke: "#2563eb", strokeWidth: 2 } : {}),
  });
}

import type { Composition } from "../../document/model";
import { createLayerGeometryIndex, type LayerGeometryIndex } from "../../layers/geometry-index";
import { transformPoint, type Bounds } from "../../layers/geometry";
import type { SnapKind, SnapTarget } from "./model";

function appendBox(targets: SnapTarget[], bounds: Bounds, id: string, kind: SnapKind): void {
  for (let anchor = 0; anchor < 3; anchor++) {
    targets.push({
      axis: "x",
      value: bounds.x + (bounds.width * anchor) / 2,
      min: bounds.y,
      max: bounds.y + bounds.height,
      id,
      kind,
    });
    targets.push({
      axis: "y",
      value: bounds.y + (bounds.height * anchor) / 2,
      min: bounds.x,
      max: bounds.x + bounds.width,
      id,
      kind,
    });
  }
}

/** One indexed walk; moving groups exclude their whole subtree, as do hidden/mask-source groups. */
export function collectSnapTargets(
  page: Composition,
  movingIds: ReadonlySet<string>,
  geometry: LayerGeometryIndex = createLayerGeometryIndex(page),
): SnapTarget[] {
  const targets: SnapTarget[] = [];
  appendBox(targets, { x: 0, y: 0, width: page.width, height: page.height }, page.id, "page");
  for (const guide of page.guides)
    targets.push({
      axis: guide.axis,
      value: guide.position,
      min: 0,
      max: guide.axis === "x" ? page.height : page.width,
      id: guide.id,
      kind: "guide",
      ...(guide.color ? { color: guide.color } : {}),
    });
  if (page.margins) {
    const m = page.margins;
    appendBox(
      targets,
      {
        x: m.left,
        y: m.top,
        width: page.width - m.left - m.right,
        height: page.height - m.top - m.bottom,
      },
      `${page.id}:margins`,
      "margin",
    );
  }
  const pending: (string | null)[] = [null];
  while (pending.length) {
    for (const layer of geometry.children(pending.pop()!)) {
      if (movingIds.has(layer.id) || layer.maskSource || !layer.visible || layer.opacity <= 0)
        continue;
      const bounds =
        layer.parentId === null && layer.rotation === 0 ? layer : geometry.worldBounds(layer.id);
      appendBox(targets, bounds, layer.id, "layer");
      if (layer.kind === "group") pending.push(layer.id);
      if (layer.guides?.length) {
        const matrix = geometry.worldMatrix(layer.id);
        for (const guide of layer.guides) {
          const a = transformPoint(
            matrix,
            guide.axis === "x" ? { x: guide.position, y: 0 } : { x: 0, y: guide.position },
          );
          const b = transformPoint(
            matrix,
            guide.axis === "x"
              ? { x: guide.position, y: layer.height }
              : { x: layer.width, y: guide.position },
          );
          if (Math.abs(a.x - b.x) < 1e-7)
            targets.push({
              axis: "x",
              value: a.x,
              min: Math.min(a.y, b.y),
              max: Math.max(a.y, b.y),
              id: guide.id,
              kind: "guide",
              ...(guide.color ? { color: guide.color } : {}),
            });
          else if (Math.abs(a.y - b.y) < 1e-7)
            targets.push({
              axis: "y",
              value: a.y,
              min: Math.min(a.x, b.x),
              max: Math.max(a.x, b.x),
              id: guide.id,
              kind: "guide",
              ...(guide.color ? { color: guide.color } : {}),
            });
        }
      }
    }
  }
  return targets;
}

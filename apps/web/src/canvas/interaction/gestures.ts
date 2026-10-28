import {
  createLayerGeometryIndex,
  getWorldMatrix,
  invertMatrix,
  transformPoint,
  type Command,
  type Composition,
  type Layer,
} from "@musart/core";
import type { Point } from "../viewport/view";

export type Tool =
  | "pointer"
  | "hand"
  | "shape"
  | "rectangle"
  | "ellipse"
  | "text"
  | "wand"
  | "segment";
export type Handle = "nw" | "ne" | "sw" | "se" | "rotate";
export interface LayerPatch {
  layerId: string;
  patch: Partial<Layer>;
}

export function selectedRoots(page: Composition, ids: string[]): Layer[] {
  const index = createLayerGeometryIndex(page),
    requested = new Set(ids),
    roots = new Set<string>();
  const pending = [{ parent: null as string | null, blocked: false }];
  while (pending.length) {
    const current = pending.pop()!;
    for (const layer of index.children(current.parent)) {
      const selected = requested.has(layer.id),
        blocked = current.blocked || layer.locked;
      if (selected && !blocked) roots.add(layer.id);
      if (layer.kind === "group") pending.push({ parent: layer.id, blocked: blocked || selected });
    }
  }
  return page.layers.filter((layer) => roots.has(layer.id));
}

export function movePatches(
  page: Composition,
  layers: Layer[],
  from: Point,
  to: Point,
  snapEnabled: boolean,
  threshold: number,
): LayerPatch[] {
  let target = to;
  const first = layers[0];
  if (first && snapEnabled && first.parentId === null) {
    const candidatesX = [
      0,
      page.width / 2,
      page.width,
      ...page.guides.filter((guide) => guide.axis === "x").map((guide) => guide.position),
    ];
    const candidatesY = [
      0,
      page.height / 2,
      page.height,
      ...page.guides.filter((guide) => guide.axis === "y").map((guide) => guide.position),
    ];
    const nearest = (value: number, values: number[]) =>
      values.reduce(
        (best, candidate) =>
          Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
        value + threshold,
      );
    const x = first.x + to.x - from.x;
    const y = first.y + to.y - from.y;
    const nx = nearest(x, candidatesX);
    const ny = nearest(y, candidatesY);
    target = {
      x: Math.abs(nx - x) < threshold ? to.x + nx - x : to.x,
      y: Math.abs(ny - y) < threshold ? to.y + ny - y : to.y,
    };
  }
  const index = createLayerGeometryIndex(page),
    inverses = new Map<string, ReturnType<typeof invertMatrix>>();
  return layers.map((layer) => {
    let inverse = layer.parentId ? inverses.get(layer.parentId) : undefined;
    if (layer.parentId && !inverse) {
      inverse = invertMatrix(index.worldMatrix(layer.parentId));
      inverses.set(layer.parentId, inverse);
    }
    const start = inverse ? transformPoint(inverse, from) : from;
    const end = inverse ? transformPoint(inverse, target) : target;
    return {
      layerId: layer.id,
      patch: { x: layer.x + end.x - start.x, y: layer.y + end.y - start.y },
    };
  });
}

export function resizePatch(
  page: Composition,
  layer: Layer,
  handle: Handle,
  from: Point,
  to: Point,
  keepAspect: boolean,
): LayerPatch {
  if (handle === "rotate") {
    const matrix = getWorldMatrix(page, layer.id);
    const center = transformPoint(matrix, { x: layer.width / 2, y: layer.height / 2 });
    const angle =
      ((Math.atan2(to.y - center.y, to.x - center.x) -
        Math.atan2(from.y - center.y, from.x - center.x)) *
        180) /
      Math.PI;
    const rotation = layer.rotation + angle;
    return {
      layerId: layer.id,
      patch: { rotation: keepAspect ? Math.round(rotation / 15) * 15 : rotation },
    };
  }
  const inverse = invertMatrix(getWorldMatrix(page, layer.id));
  const a = transformPoint(inverse, from);
  const b = transformPoint(inverse, to);
  const west = handle.includes("w");
  const north = handle.includes("n");
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let width = Math.max(1, layer.width + (west ? -dx : dx));
  let height = Math.max(1, layer.height + (north ? -dy : dy));
  if (keepAspect) {
    const ratio = Math.max(width / layer.width, height / layer.height);
    width = layer.width * ratio;
    height = layer.height * ratio;
  }
  // Keep the opposite corner fixed under the layer's existing rotation.
  const theta = (layer.rotation * Math.PI) / 180;
  const localX = west ? layer.width - width : 0;
  const localY = north ? layer.height - height : 0;
  const centerOffsetX = (width - layer.width) / 2;
  const centerOffsetY = (height - layer.height) / 2;
  const x =
    layer.x +
    layer.width / 2 +
    Math.cos(theta) * (localX + centerOffsetX) -
    Math.sin(theta) * (localY + centerOffsetY) -
    width / 2;
  const y =
    layer.y +
    layer.height / 2 +
    Math.sin(theta) * (localX + centerOffsetX) +
    Math.cos(theta) * (localY + centerOffsetY) -
    height / 2;
  return { layerId: layer.id, patch: { x, y, width, height } };
}

export function patchesToCommands(patches: LayerPatch[]): Command[] {
  return patches.length
    ? [
        {
          type: "updateLayerPatches",
          patches: patches.map(({ layerId, patch }) => ({ id: layerId, patch })),
        },
      ]
    : [];
}

export function boxSelection(page: Composition, from: Point, to: Point): string[] {
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  const right = Math.max(from.x, to.x);
  const bottom = Math.max(from.y, to.y);
  const index = createLayerGeometryIndex(page),
    included = new Set<string>(),
    pending = [null as string | null];
  while (pending.length)
    for (const layer of index.children(pending.pop()!)) {
      if (!layer.visible || layer.opacity <= 0 || layer.locked || layer.maskSource) continue;
      const bounds = index.worldBounds(layer.id);
      if (
        bounds.x >= x &&
        bounds.y >= y &&
        bounds.x + bounds.width <= right &&
        bounds.y + bounds.height <= bottom
      )
        included.add(layer.id);
      if (layer.kind === "group") pending.push(layer.id);
    }
  return page.layers.filter((layer) => included.has(layer.id)).map((layer) => layer.id);
}

export function applyPreview(page: Composition, patches: LayerPatch[]): Composition {
  if (!patches.length) return page;
  const byId = new Map<string, Partial<Layer>>();
  for (const { layerId, patch } of patches) {
    const previous = byId.get(layerId);
    byId.set(layerId, previous ? { ...previous, ...patch } : patch);
  }
  return {
    ...page,
    layers: page.layers.map((layer) => {
      const patch = byId.get(layer.id);
      if (!patch) return layer;
      // Native assign is faster for large gesture batches; preserve data-only prototype keys.
      if (Object.hasOwn(layer, "__proto__") || Object.hasOwn(patch, "__proto__"))
        return { ...layer, ...patch };
      return Object.assign({}, layer, patch);
    }),
  };
}

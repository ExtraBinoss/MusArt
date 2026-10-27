import type { Composition, Layer } from "../document/model";
import { ensure } from "../errors";
import {
  IDENTITY,
  invertMatrix,
  layerTransform,
  multiplyMatrices,
  transformPoint,
  type Bounds,
  type Matrix,
  type Point,
} from "./geometry";

const empty: readonly Layer[] = Object.freeze([]);
const indexes = new WeakMap<Composition, LayerGeometryIndex>();

/** One reusable index per immutable composition; mutable command drafts are never cached. */
export function createLayerGeometryIndex(page: Composition): LayerGeometryIndex {
  if (!Object.isFrozen(page) || !Object.isFrozen(page.layers)) return new LayerGeometryIndex(page);
  const cached = indexes.get(page);
  if (cached) return cached;
  if (!page.layers.every((layer) => Object.isFrozen(layer))) return new LayerGeometryIndex(page);
  const index = new LayerGeometryIndex(page);
  indexes.set(page, index);
  return index;
}

function readonlyLayers(layers: Map<string, Layer>): ReadonlyMap<string, Layer> {
  const view: ReadonlyMap<string, Layer> = {
    get size() {
      return layers.size;
    },
    get: (id) => layers.get(id),
    has: (id) => layers.has(id),
    entries: () => layers.entries(),
    keys: () => layers.keys(),
    values: () => layers.values(),
    forEach: (callback, thisArg) =>
      layers.forEach((value, key) => callback.call(thisArg, value, key, view)),
    [Symbol.iterator]: () => layers[Symbol.iterator](),
  };
  return Object.freeze(view);
}

export class LayerGeometryIndex {
  readonly byId: ReadonlyMap<string, Layer>;
  private readonly childLists = new Map<string | null, readonly Layer[]>();
  private readonly matrices = new Map<string, Matrix>();
  private readonly inverses = new Map<string, Matrix>();
  private readonly bounds = new Map<string, Readonly<Bounds>>();
  private readonly flags = new Map<string, { locked: boolean; visible: boolean }>();
  constructor(page: Composition) {
    const byId = new Map<string, Layer>();
    const children = new Map<string | null, Layer[]>();
    for (const layer of page.layers) {
      ensure(!byId.has(layer.id), "INVALID_HIERARCHY", "Duplicate geometry ID");
      byId.set(layer.id, layer);
      const siblings = children.get(layer.parentId) ?? [];
      siblings.push(layer);
      children.set(layer.parentId, siblings);
    }
    for (const [parent, siblings] of children) this.childLists.set(parent, Object.freeze(siblings));
    this.byId = readonlyLayers(byId);
    for (const layer of page.layers)
      if (layer.parentId) {
        const parent = byId.get(layer.parentId);
        ensure(
          parent?.kind === "group",
          "INVALID_HIERARCHY",
          "Geometry parent is missing or is not a group",
        );
      }
  }
  get(id: string): Layer {
    const layer = this.byId.get(id);
    ensure(layer, "NOT_FOUND", "Geometry layer is missing");
    return layer;
  }
  children(parentId: string | null): readonly Layer[] {
    return this.childLists.get(parentId) ?? empty;
  }
  ancestors(id: string): Layer[] {
    const result: Layer[] = [],
      seen = new Set([id]);
    let layer = this.get(id);
    while (layer.parentId) {
      ensure(!seen.has(layer.parentId), "INVALID_HIERARCHY", "Geometry parent cycle");
      seen.add(layer.parentId);
      layer = this.get(layer.parentId);
      result.push(layer);
    }
    return result.reverse();
  }
  worldMatrix(id: string): Matrix {
    const cached = this.matrices.get(id);
    if (cached) return cached;
    const pending: Layer[] = [],
      seen = new Set<string>();
    let current: string | null = id;
    while (current !== null && !this.matrices.has(current)) {
      ensure(!seen.has(current), "INVALID_HIERARCHY", "Geometry parent cycle");
      seen.add(current);
      const layer = this.get(current);
      pending.push(layer);
      current = layer.parentId;
    }
    let matrix = current === null ? IDENTITY : this.matrices.get(current)!;
    let flags = current === null ? { locked: false, visible: true } : this.flags.get(current)!;
    for (let at = pending.length - 1; at >= 0; at--) {
      const layer = pending[at]!;
      matrix = Object.freeze(multiplyMatrices(matrix, layerTransform(layer)));
      flags = {
        locked: flags.locked || layer.locked,
        visible: flags.visible && layer.visible && layer.opacity > 0,
      };
      this.matrices.set(layer.id, matrix);
      this.flags.set(layer.id, flags);
    }
    return this.matrices.get(id)!;
  }
  isLocked(id: string): boolean {
    this.worldMatrix(id);
    return this.flags.get(id)!.locked;
  }
  isVisible(id: string): boolean {
    this.worldMatrix(id);
    return this.flags.get(id)!.visible;
  }
  worldBounds(id: string): Readonly<Bounds> {
    const cached = this.bounds.get(id);
    if (cached) return cached;
    const layer = this.get(id),
      matrix = this.worldMatrix(id);
    const corners = [
      { x: 0, y: 0 },
      { x: layer.width, y: 0 },
      { x: layer.width, y: layer.height },
      { x: 0, y: layer.height },
    ].map((point) => transformPoint(matrix, point));
    const left = Math.min(...corners.map((point) => point.x)),
      top = Math.min(...corners.map((point) => point.y));
    const bounds = Object.freeze({
      x: left,
      y: top,
      width: Math.max(...corners.map((point) => point.x)) - left,
      height: Math.max(...corners.map((point) => point.y)) - top,
    });
    this.bounds.set(id, bounds);
    return bounds;
  }
  /** Iterative front-to-back traversal preserves group clipping and fallback selection. */
  hitTest(point: Point): Layer | null {
    const roots = this.children(null);
    const stack: { children: readonly Layer[]; at: number; fallback?: Layer }[] = [
      { children: roots, at: roots.length - 1 },
    ];
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      if (frame.at < 0) {
        stack.pop();
        if (frame.fallback) return frame.fallback;
        continue;
      }
      const layer = frame.children[frame.at--]!;
      if (this.isLocked(layer.id) || !this.isVisible(layer.id)) continue;
      const bounds = this.worldBounds(layer.id);
      if (
        point.x < bounds.x ||
        point.y < bounds.y ||
        point.x > bounds.x + bounds.width ||
        point.y > bounds.y + bounds.height
      )
        continue;
      let inverse = this.inverses.get(layer.id);
      if (!inverse) {
        inverse = invertMatrix(this.worldMatrix(layer.id));
        this.inverses.set(layer.id, inverse);
      }
      const local = transformPoint(inverse, point);
      if (local.x < 0 || local.y < 0 || local.x > layer.width || local.y > layer.height) continue;
      if (
        layer.kind === "ellipse" &&
        ((local.x - layer.width / 2) / (layer.width / 2)) ** 2 +
          ((local.y - layer.height / 2) / (layer.height / 2)) ** 2 >
          1
      )
        continue;
      if (layer.kind !== "group") return layer;
      const children = this.children(layer.id);
      stack.push({ children, at: children.length - 1, fallback: layer });
    }
    return null;
  }
}

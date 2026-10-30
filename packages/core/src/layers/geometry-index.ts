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
  readonly #lookup: Map<string, Layer>;
  private readonly childLists = new Map<string | null, readonly Layer[]>();
  private readonly matrices = new Map<string, Matrix>();
  private readonly localInverses = new Map<string, Matrix>();
  private readonly bounds = new Map<string, Readonly<Bounds>>();
  private readonly flags = new Map<string, { locked: boolean; visible: boolean }>();
  constructor(page: Composition) {
    const byId = new Map<string, Layer>();
    this.#lookup = byId;
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
    const layer = this.#lookup.get(id);
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
    const layer = this.get(id);
    if (layer.parentId === null) return layer.locked;
    this.worldMatrix(id);
    return this.flags.get(id)!.locked;
  }
  isVisible(id: string): boolean {
    const layer = this.get(id);
    if (layer.parentId === null) return layer.visible && layer.opacity > 0;
    this.worldMatrix(id);
    return this.flags.get(id)!.visible;
  }
  worldBounds(id: string): Readonly<Bounds> {
    const cached = this.bounds.get(id);
    if (cached) return cached;
    const layer = this.get(id);
    if (
      layer.parentId === null &&
      layer.rotation === 0 &&
      (layer.scaleX ?? 1) === 1 &&
      (layer.scaleY ?? 1) === 1
    ) {
      const direct = Object.freeze({
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
      });
      this.bounds.set(id, direct);
      return direct;
    }
    const matrix = this.worldMatrix(id);
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
  /** One union allocation; missing IDs are skipped for transient selections of removed layers. */
  collectiveBounds(ids: Iterable<string>): Readonly<Bounds> | null {
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const id of ids) {
      const layer = this.#lookup.get(id);
      if (!layer) continue;
      const bounds =
        layer.parentId === null &&
        layer.rotation === 0 &&
        (layer.scaleX ?? 1) === 1 &&
        (layer.scaleY ?? 1) === 1
          ? layer
          : this.worldBounds(id);
      left = Math.min(left, bounds.x);
      top = Math.min(top, bounds.y);
      right = Math.max(right, bounds.x + bounds.width);
      bottom = Math.max(bottom, bounds.y + bounds.height);
    }
    return Number.isFinite(left)
      ? Object.freeze({ x: left, y: top, width: right - left, height: bottom - top })
      : null;
  }
  /** Parent-local traversal rejects cheap bounds before allocating any world geometry. */
  hitTest(point: Point, options: { includeLocked?: boolean } = {}): Layer | null {
    const roots = this.children(null);
    const stack: { children: readonly Layer[]; at: number; point: Point; fallback?: Layer }[] = [
      { children: roots, at: roots.length - 1, point },
    ];
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      if (frame.at < 0) {
        stack.pop();
        if (frame.fallback) return frame.fallback;
        continue;
      }
      const layer = frame.children[frame.at--]!;
      if (
        layer.maskSource ||
        (layer.locked && !options.includeLocked) ||
        !layer.visible ||
        layer.opacity <= 0
      )
        continue;
      let local: Point;
      if (layer.rotation === 0) {
        const x = frame.point.x - layer.x,
          y = frame.point.y - layer.y;
        if (x < 0 || y < 0 || x > layer.width || y > layer.height) continue;
        local = { x, y };
      } else {
        // A conservative square contains every rotation of the local rectangle.
        const radius = (layer.width + layer.height) / 2;
        if (
          Math.abs(frame.point.x - layer.x - layer.width / 2) > radius ||
          Math.abs(frame.point.y - layer.y - layer.height / 2) > radius
        )
          continue;
        let inverse = this.localInverses.get(layer.id);
        if (!inverse) {
          inverse = invertMatrix(layerTransform(layer));
          this.localInverses.set(layer.id, inverse);
        }
        local = transformPoint(inverse, frame.point);
        if (local.x < 0 || local.y < 0 || local.x > layer.width || local.y > layer.height) continue;
      }
      if (
        layer.kind === "ellipse" &&
        ((local.x - layer.width / 2) / (layer.width / 2)) ** 2 +
          ((local.y - layer.height / 2) / (layer.height / 2)) ** 2 >
          1
      )
        continue;
      if (layer.kind !== "group") return layer;
      const children = this.children(layer.id);
      stack.push({ children, at: children.length - 1, point: local, fallback: layer });
    }
    return null;
  }
}

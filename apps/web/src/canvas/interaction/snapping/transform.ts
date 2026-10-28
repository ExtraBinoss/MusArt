import {
  SnapIndex,
  createLayerGeometryIndex,
  IDENTITY,
  layerTransform,
  multiplyMatrices,
  transformPoint,
  type Composition,
  type Layer,
  type Point,
  type SnapCue,
} from "@musart/core";
import { movePatches, resizePatch, type Handle, type LayerPatch } from "../gestures";
export interface SnappedTransform {
  patches: LayerPatch[];
  cues: readonly SnapCue[];
}

/** One captured canonical page and one lazily built candidate index per gesture. */
export class TransformSnapping {
  private index: SnapIndex | null = null;
  constructor(
    private readonly page: Composition,
    private readonly layers: Layer[],
  ) {}
  private candidates(): SnapIndex {
    return (this.index ??= new SnapIndex(
      this.page,
      this.layers.map((layer) => layer.id),
    ));
  }
  move(from: Point, to: Point, enabled: boolean, threshold: number): SnappedTransform {
    let target = to;
    let cues: readonly SnapCue[] = [];
    if (enabled) {
      const index = this.candidates(),
        bounds = index.movingBounds;
      if (bounds) {
        const result = index.snap(
          { ...bounds, x: bounds.x + to.x - from.x, y: bounds.y + to.y - from.y },
          threshold,
        );
        target = { x: to.x + result.delta.x, y: to.y + result.delta.y };
        cues = result.cues;
      }
    }
    return { patches: movePatches(this.page, this.layers, from, target, false, threshold), cues };
  }
  resize(
    handle: Handle,
    from: Point,
    to: Point,
    aspect: boolean,
    enabled: boolean,
    threshold: number,
  ): SnappedTransform {
    const layer = this.layers[0];
    if (!layer) return { patches: [], cues: [] };
    const raw = resizePatch(this.page, layer, handle, from, to, aspect);
    if (!enabled || handle === "rotate") return { patches: [raw], cues: [] };
    const geometry = createLayerGeometryIndex(this.page);
    const parent = layer.parentId ? geometry.worldMatrix(layer.parentId) : IDENTITY;
    const west = handle.includes("w"),
      north = handle.includes("n");
    const corner = (patch: LayerPatch): Point => {
      const next = { ...layer, ...patch.patch };
      return transformPoint(multiplyMatrices(parent, layerTransform(next)), {
        x: west ? 0 : next.width,
        y: north ? 0 : next.height,
      });
    };
    const point = corner(raw),
      index = this.candidates();
    const snapped = index.snap({ ...point, width: 0, height: 0 }, threshold);
    if (!snapped.cues.length) return { patches: [raw], cues: [] };
    let corrected = { x: point.x + snapped.delta.x, y: point.y + snapped.delta.y };
    if (aspect) {
      const matrix = geometry.worldMatrix(layer.id);
      const anchor = transformPoint(matrix, {
        x: west ? layer.width : 0,
        y: north ? layer.height : 0,
      });
      const original = transformPoint(matrix, {
        x: west ? 0 : layer.width,
        y: north ? 0 : layer.height,
      });
      const vector = { x: original.x - anchor.x, y: original.y - anchor.y };
      let distance = Infinity;
      corrected = point;
      for (const cue of snapped.cues) {
        const size = vector[cue.axis];
        if (Math.abs(size) < 1e-9) continue;
        const scale = (cue.position - anchor[cue.axis]) / size;
        if (scale < Math.max(1 / layer.width, 1 / layer.height)) continue;
        const candidate = { x: anchor.x + vector.x * scale, y: anchor.y + vector.y * scale };
        const error = Math.hypot(candidate.x - point.x, candidate.y - point.y);
        if (error <= threshold * (1 + 2 ** -23) && error < distance) {
          corrected = candidate;
          distance = error;
        }
      }
    }
    const patch = resizePatch(
      this.page,
      layer,
      handle,
      from,
      { x: to.x + corrected.x - point.x, y: to.y + corrected.y - point.y },
      aspect,
    );
    const achieved = corner(patch),
      axes = new Set(
        snapped.cues
          .filter((cue) => Math.abs(achieved[cue.axis] - cue.position) < 1e-6)
          .map((cue) => cue.axis),
      );
    const actual = index.snap({ ...achieved, width: 0, height: 0 }, 1e-6);
    return { patches: [patch], cues: actual.cues.filter((cue) => axes.has(cue.axis)) };
  }
}

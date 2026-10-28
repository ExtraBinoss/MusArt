import type { Composition } from "../../document/model";
import { createLayerGeometryIndex } from "../../layers/geometry-index";
import type { Bounds, Point } from "../../layers/geometry";
import { SnapAxisIndex, compareSnapMatches } from "./axis-index";
import { collectSnapTargets } from "./targets";
import type { AxisMatch, SnapCue, SnapResult } from "./model";

function cue(match: AxisMatch, axis: "x" | "y", bounds: Bounds): SnapCue {
  const target = match.target,
    min = axis === "x" ? bounds.y : bounds.x,
    max = min + (axis === "x" ? bounds.height : bounds.width);
  const point = (value: number): Point =>
    Object.freeze(axis === "x" ? { x: target.value, y: value } : { x: value, y: target.value });
  const gap =
    max < target.min
      ? { from: max, to: target.min }
      : target.max < min
        ? { from: target.max, to: min }
        : null;
  return Object.freeze({
    axis,
    position: target.value,
    from: point(Math.min(min, target.min)),
    to: point(Math.max(max, target.max)),
    targetId: target.id,
    kind: target.kind,
    ...(target.color ? { color: target.color } : {}),
    ...(gap
      ? {
          gap: Object.freeze({
            axis: axis === "x" ? ("y" as const) : ("x" as const),
            from: point(gap.from),
            to: point(gap.to),
            value: gap.to - gap.from,
          }),
        }
      : {}),
  });
}

/** Reuse for the gesture lifetime. Query work is bounded regardless of layer count. */
export class SnapIndex {
  readonly movingBounds: Readonly<Bounds> | null;
  private readonly x: SnapAxisIndex;
  private readonly y: SnapAxisIndex;
  readonly targetCount: number;
  constructor(page: Composition, movingIds: readonly string[] = []) {
    const geometry = createLayerGeometryIndex(page),
      targets = collectSnapTargets(page, new Set(movingIds), geometry);
    this.movingBounds = geometry.collectiveBounds(movingIds);
    this.x = new SnapAxisIndex(targets.filter((target) => target.axis === "x"));
    this.y = new SnapAxisIndex(targets.filter((target) => target.axis === "y"));
    this.targetCount = targets.length;
  }
  snap(bounds: Bounds, threshold: number): SnapResult {
    if (
      ![bounds.x, bounds.y, bounds.width, bounds.height, threshold].every(Number.isFinite) ||
      bounds.width < 0 ||
      bounds.height < 0 ||
      threshold < 0
    )
      throw new RangeError("Invalid snapping geometry or tolerance.");
    let x: AxisMatch | null = null,
      y: AxisMatch | null = null,
      checks = 0;
    for (const axis of ["x", "y"] as const) {
      const start = axis === "x" ? bounds.x : bounds.y,
        size = axis === "x" ? bounds.width : bounds.height;
      const cross = axis === "x" ? bounds.y + bounds.height / 2 : bounds.x + bounds.width / 2;
      let best: AxisMatch | null = null;
      for (const value of new Set([start, start + size / 2, start + size])) {
        const result = (axis === "x" ? this.x : this.y).nearest(value, cross, threshold);
        checks += result.checks;
        if (result.match && (!best || compareSnapMatches(result.match, best, cross) < 0))
          best = result.match;
      }
      if (axis === "x") x = best;
      else y = best;
    }
    const delta = Object.freeze({ x: x?.correction ?? 0, y: y?.correction ?? 0 });
    const snapped = Object.freeze({ ...bounds, x: bounds.x + delta.x, y: bounds.y + delta.y });
    return Object.freeze({
      delta,
      bounds: snapped,
      cues: Object.freeze([
        ...(x ? [cue(x, "x", snapped)] : []),
        ...(y ? [cue(y, "y", snapped)] : []),
      ]),
      checks,
    });
  }
}

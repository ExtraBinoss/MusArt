import type { AxisMatch, SnapTarget } from "./model";
const priority = { guide: 0, margin: 1, layer: 2, page: 3 } as const;
const center = (target: SnapTarget) => (target.min + target.max) / 2;
function order(a: SnapTarget, b: SnapTarget): number {
  return priority[a.kind] - priority[b.kind] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
/** One deterministic tie rule for coordinates and all moving edges/centers. */
export function compareSnapMatches(a: AxisMatch, b: AxisMatch, perpendicular: number): number {
  const distance = Math.abs(a.correction) - Math.abs(b.correction);
  if (Math.abs(distance) > 1e-8) return distance;
  return (
    priority[a.target.kind] - priority[b.target.kind] ||
    Math.abs(center(a.target) - perpendicular) - Math.abs(center(b.target) - perpendicular) ||
    order(a.target, b.target)
  );
}
/** Flat sorted runs avoid allocating a bucket and several arrays for every coordinate. */
export class SnapAxisIndex {
  private readonly values: number[] = [];
  private readonly starts: number[] = [];
  private readonly targets: SnapTarget[] = [];
  constructor(targets: readonly SnapTarget[]) {
    const sorted = [...targets].sort(
      (a, b) =>
        a.value - b.value ||
        priority[a.kind] - priority[b.kind] ||
        center(a) - center(b) ||
        order(a, b),
    );
    let value: number | undefined,
      kind: SnapTarget["kind"] | undefined,
      previousCenter = NaN;
    for (const target of sorted) {
      if (target.value !== value) {
        value = target.value;
        kind = target.kind;
        previousCenter = NaN;
        this.values.push(value);
        this.starts.push(this.targets.length);
      }
      if (target.kind === kind && center(target) !== previousCenter) {
        this.targets.push(target);
        previousCenter = center(target);
      }
    }
    this.starts.push(this.targets.length);
  }
  nearest(
    value: number,
    perpendicular: number,
    threshold: number,
  ): { match: AxisMatch | null; checks: number } {
    let low = 0,
      high = this.values.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.values[middle]! < value) low = middle + 1;
      else high = middle;
    }
    const position = low;
    // CSS transforms round to float32 while view coordinates retain doubles.
    // Keep the inclusive boundary within one relative float32 epsilon.
    const tolerance = threshold * (1 + 2 ** -23);
    let match: AxisMatch | null = null,
      checks = 0;
    for (let bucket = position - 1; bucket <= position; bucket++) {
      const coordinate = this.values[bucket];
      if (coordinate === undefined || Math.abs(coordinate - value) > tolerance) continue;
      const start = this.starts[bucket]!,
        end = this.starts[bucket + 1]!;
      low = start;
      high = end;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (center(this.targets[middle]!) < perpendicular) low = middle + 1;
        else high = middle;
      }
      for (let index = Math.max(start, low - 1); index < Math.min(end, low + 1); index++) {
        const target = this.targets[index]!;
        checks++;
        const candidate = { target, correction: target.value - value };
        if (!match || compareSnapMatches(candidate, match, perpendicular) < 0) match = candidate;
      }
    }
    return { match, checks };
  }
}

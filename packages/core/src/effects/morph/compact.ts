import type { MorphPoint, ShapeMorph } from "./model";
import { validateShapeMorph } from "./validation";

function distanceSquared(p: MorphPoint, a: MorphPoint, b: MorphPoint, sx: number, sy: number) {
  const x = (p[0] - a[0]) * sx,
    y = (p[1] - a[1]) * sy;
  const dx = (b[0] - a[0]) * sx,
    dy = (b[1] - a[1]) * sy;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, (x * dx + y * dy) / length)) : 0;
  return (x - t * dx) ** 2 + (y - t * dy) ** 2;
}
function simplify(points: readonly MorphPoint[], sx: number, sy: number, tolerance: number) {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let furthest = -1,
      distance = tolerance * tolerance;
    for (let i = start! + 1; i < end!; i++) {
      const error = distanceSquared(points[i]!, points[start!]!, points[end!]!, sx, sy);
      if (error > distance) {
        distance = error;
        furthest = i;
      }
    }
    if (furthest >= 0) {
      keep[furthest] = 1;
      stack.push([start!, furthest], [furthest, end!]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
const area = (points: readonly MorphPoint[]) =>
  points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0);
const cross = (a: MorphPoint, b: MorphPoint, c: MorphPoint) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function simple(points: readonly MorphPoint[]) {
  if (new Set(points.map((point) => point.join(","))).size !== points.length) return false;
  for (let i = 0; i < points.length; i++)
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const a = points[i]!,
        b = points[(i + 1) % points.length]!,
        c = points[j]!,
        d = points[(j + 1) % points.length]!;
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return false;
    }
  return true;
}
function compactContour(points: MorphPoint[], sx: number, sy: number, tolerance: number) {
  let split = 0,
    furthest = 0;
  for (let i = 1; i < points.length; i++) {
    const distance = distanceSquared(points[i]!, points[0]!, points[0]!, sx, sy);
    if (distance > furthest) {
      split = i;
      furthest = distance;
    }
  }
  if (!split) return points;
  const reserve = Math.min(0.1, tolerance * 0.1);
  const left = simplify(points.slice(0, split + 1), sx, sy, tolerance - reserve);
  const right = simplify([...points.slice(split), points[0]!], sx, sy, tolerance - reserve);
  const joined = [...left.slice(0, -1), ...right.slice(0, -1)];
  const raw = joined.filter(
    (point, i) =>
      distanceSquared(
        point,
        joined[(i + joined.length - 1) % joined.length]!,
        joined[(i + 1) % joined.length]!,
        sx,
        sy,
      ) > 1e-20,
  );
  const digits = Math.max(0, Math.ceil(Math.log10(Math.hypot(sx, sy) / (2 * reserve))));
  const candidate =
    digits > 12
      ? raw
      : raw.map(([x, y]): MorphPoint => [Number(x.toFixed(digits)), Number(y.toFixed(digits))]);
  if (candidate.length < 3 || candidate.length > points.length || candidate.length > 512)
    return points;
  const before = area(points),
    after = area(candidate);
  // Preserve winding, small counters, and topology; ambiguous simplifications stay authored.
  if (
    Math.sign(before) !== Math.sign(after) ||
    Math.abs(after - before) > Math.abs(before) * 0.01 ||
    !simple(candidate)
  )
    return points;
  return candidate;
}
function inside(point: MorphPoint, ring: readonly MorphPoint[]) {
  let found = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!,
      b = ring[j]!;
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      found = !found;
  }
  return found;
}
function compactFrame(
  frame: ShapeMorph["shapes"][number]["frames"][number],
  width: number,
  height: number,
  tolerance: number,
) {
  const contours = frame.contours.map((contour) => ({
    ...contour,
    points: compactContour(contour.points, width * frame.box[2], height * frame.box[3], tolerance),
  }));
  // A hole must stay inside an outer ring, and changed contours may not cross neighbours.
  for (let i = 0; i < contours.length; i++) {
    const a = contours[i]!;
    if (a.hole && !contours.some((outer) => !outer.hole && inside(a.points[0]!, outer.points)))
      return frame;
    for (let j = i + 1; j < contours.length; j++) {
      const b = contours[j]!;
      if (a.points === frame.contours[i]!.points && b.points === frame.contours[j]!.points)
        continue;
      for (let x = 0; x < a.points.length; x++)
        for (let y = 0; y < b.points.length; y++) {
          const p = a.points[x]!,
            q = a.points[(x + 1) % a.points.length]!,
            r = b.points[y]!,
            s = b.points[(y + 1) % b.points.length]!;
          if (cross(p, q, r) * cross(p, q, s) < 0 && cross(r, s, p) * cross(r, s, q) < 0)
            return frame;
        }
    }
  }
  return { ...frame, contours };
}
/** Compact authored paths in final layer pixels, preserving every timed state and explicit hole.
 * Portable coordinates remain ordinary numbers; no tolerance, GPU resource or cache ID is saved. */
export function compactShapeMorph(
  definition: unknown,
  options: { width: number; height: number; maxErrorPx: number },
): ShapeMorph {
  const { width, height, maxErrorPx } = options;
  if (
    ![width, height, maxErrorPx].every(Number.isFinite) ||
    width <= 0 ||
    width > 32768 ||
    height <= 0 ||
    height > 32768 ||
    maxErrorPx < 0 ||
    maxErrorPx > 4
  )
    throw new RangeError("Invalid morph compaction tolerance.");
  validateShapeMorph(definition);
  if (!maxErrorPx) return definition;
  return {
    ...definition,
    shapes: definition.shapes.map((shape) => ({
      frames: shape.frames.map((frame) => compactFrame(frame, width, height, maxErrorPx)),
    })),
  };
}

import type { PathCommand } from "./outlines";

export type Point = readonly [number, number];
export interface Quadratic {
  p0: Point;
  p1: Point;
  p2: Point;
}
const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const cubicAt = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
  const s = 1 - t;
  return [0, 1].map(
    (i) => s ** 3 * a[i]! + 3 * s * s * t * b[i]! + 3 * s * t * t * c[i]! + t ** 3 * d[i]!,
  ) as unknown as Point;
};
function cubic(a: Point, b: Point, c: Point, d: Point, output: Quadratic[], depth = 0) {
  const q: Point = [(3 * (b[0] + c[0]) - a[0] - d[0]) / 4, (3 * (b[1] + c[1]) - a[1] - d[1]) / 4];
  const error = Math.max(
    ...[0.25, 0.75].map((t) => {
      const actual = cubicAt(a, b, c, d, t),
        s = 1 - t;
      return Math.hypot(
        actual[0] - (s * s * a[0] + 2 * s * t * q[0] + t * t * d[0]),
        actual[1] - (s * s * a[1] + 2 * s * t * q[1] + t * t * d[1]),
      );
    }),
  );
  if (error <= 0.125 || depth >= 12) {
    output.push({ p0: a, p1: q, p2: d });
    return;
  }
  const ab = mid(a, b),
    bc = mid(b, c),
    cd = mid(c, d),
    abc = mid(ab, bc),
    bcd = mid(bc, cd),
    center = mid(abc, bcd);
  cubic(a, ab, abc, center, output, depth + 1);
  cubic(center, bcd, cd, d, output, depth + 1);
}
/** Outline preparation only; filled glyph coverage is evaluated analytically on the GPU. */
export function quadraticCurves(commands: PathCommand[]): Quadratic[] {
  const output: Quadratic[] = [];
  let current: Point = [0, 0],
    start = current;
  const close = () => {
    if (current[0] !== start[0] || current[1] !== start[1])
      output.push({ p0: current, p1: mid(current, start), p2: start });
    current = start;
  };
  for (const command of commands) {
    if (command.type === "M") {
      close();
      start = current = [command.x, command.y];
    } else if (command.type === "L") {
      const next: Point = [command.x, command.y];
      output.push({ p0: current, p1: mid(current, next), p2: next });
      current = next;
    } else if (command.type === "Q") {
      const next: Point = [command.x, command.y];
      output.push({ p0: current, p1: [command.x1, command.y1], p2: next });
      current = next;
    } else if (command.type === "C") {
      const next: Point = [command.x, command.y];
      cubic(current, [command.x1, command.y1], [command.x2, command.y2], next, output);
      current = next;
    } else close();
  }
  close();
  return output.filter(
    ({ p0, p1, p2 }) => p0[0] !== p1[0] || p0[1] !== p1[1] || p1[0] !== p2[0] || p1[1] !== p2[1],
  );
}

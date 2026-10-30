// Original Maskot geometry assertions, shared without reducing their sample matrix.
import type { RenderedEye, StateId } from "../../../../src/ui/brand/engine/bot-types";
import { BotEngine } from "../../../../src/ui/brand/engine/engine";
import { EXPRESSIONS } from "../../../../src/ui/brand/engine/expressions";
const R = 100;
type Point = { x: number; y: number };
type Segment = { a: Point; b: Point };
export type Contour = {
  points: Point[];
  segments: Segment[];
  minY: number;
  maxY: number;
  scale: number;
  bands: Segment[][];
};
export const BAND_COUNT = 32;
const MAX_CONTOURS = 128;

function contourDuCorps(d: string) {
  const pts: Array<{
    x: number;
    y: number;
  }> = [];
  for (const seg of d.slice(1).split("C")) {
    const n = seg.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
    if (n.length >= 6) pts.push({ x: n[4]!, y: n[5]! });
    else if (n.length === 2) pts.push({ x: n[0]!, y: n[1]! });
  }
  return pts;
}

export function prepareContour(path: string): Contour {
  const points = contourDuCorps(path);
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const scale = maxY > minY ? BAND_COUNT / (maxY - minY) : 0;
  const bands = Array.from({ length: BAND_COUNT }, () => [] as Segment[]);
  const segments = points.map((a, index) => ({
    a,
    b: points[(index + points.length - 1) % points.length],
  }));
  for (const segment of segments) {
    const start = Math.max(0, Math.floor((Math.min(segment.a.y, segment.b.y) - minY) * scale));
    const end = Math.min(
      BAND_COUNT - 1,
      Math.floor((Math.max(segment.a.y, segment.b.y) - minY) * scale),
    );
    for (let band = start; band <= end; band++) bands[band].push(segment);
  }
  return { points, segments, minY, maxY, scale, bands };
}

export function raycast(segments: Segment[], x: number, y: number) {
  let on = false;
  for (const { a, b } of segments) {
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) on = !on;
  }
  return on;
}

export function dedans(contour: Contour, x: number, y: number) {
  if (y < contour.minY || y >= contour.maxY) return false;
  const band = Math.min(BAND_COUNT - 1, Math.floor((y - contour.minY) * contour.scale));
  return raycast(contour.bands[band], x, y);
}

function contourDeLOeil(eye: RenderedEye, N = 32) {
  const g = eye.d.match(/-?\d+\.?\d*/g)!.map(Number);
  const hw = Math.abs(g[0]!);
  const r = Math.abs(g[2]!);
  const droit = Math.abs(g[1]!);
  const m = eye.matrix.match(/-?\d+\.?\d*/g)!.map(Number);
  const [a, b, c, d, e, f] = m as [number, number, number, number, number, number];
  const out: Array<{
    x: number;
    y: number;
  }> = [];
  for (let i = 0; i < N; i++) {
    const u = (i / N) * 4;
    let x: number;
    let y: number;
    if (u < 1) {
      const t = Math.PI * (u - 0.5);
      x = Math.cos(t) * r;
      y = -droit + Math.sin(t) * r;
    } else if (u < 2) {
      x = hw;
      y = -droit + (u - 1) * 2 * droit;
    } else if (u < 3) {
      const t = Math.PI * (u - 2 + 0.5);
      x = Math.cos(t) * r;
      y = droit + Math.sin(t) * r;
    } else {
      x = -hw;
      y = droit - (u - 3) * 2 * droit;
    }
    out.push({ x: a * x + c * y + e, y: b * x + d * y + f });
  }
  return out;
}

const INSTANTS = 60;
const PAS = 1 / 20;

export function debordement(
  state: StateId,
  radii: number[],
  expr: (typeof EXPRESSIONS)[number] | null,
  contours: Map<string, Contour>,
) {
  const e = new BotEngine(R, state, radii, expr);
  let pire = 0;
  for (let i = 0; i < INSTANTS; i++) {
    const f = e.sample(i * PAS);
    let corps = contours.get(f.bodyPath);
    if (!corps) {
      corps = prepareContour(f.bodyPath);
      if (contours.size >= MAX_CONTOURS) contours.delete(contours.keys().next().value!);
      contours.set(f.bodyPath, corps);
    }
    for (const eye of f.eyes) {
      for (const p of contourDeLOeil(eye)) {
        if (dedans(corps, p.x, p.y)) continue;
        let distance = Infinity;
        for (const q of corps.points)
          distance = Math.min(distance, Math.hypot(q.x - p.x, q.y - p.y));
        pire = Math.max(pire, distance);
      }
    }
  }
  return pire;
}

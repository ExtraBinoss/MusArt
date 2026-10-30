import type { TimelineCanvasClip } from "./model";

export function waveformPoints(item: TimelineCanvasClip, width: number) {
  const peaks = item.peaks;
  if (!peaks?.length || item.sourceDuration <= 0 || item.duration <= 0) return [];
  const { bounds } = item,
    start = Math.max(0, bounds.x),
    end = Math.min(width, bounds.x + bounds.width);
  if (end <= start) return [];
  const amplitude = Math.max(1, bounds.height - 1.5);
  const sample = (pixel: number) =>
    ((item.sourceIn + ((pixel - bounds.x) / bounds.width) * item.duration) / item.sourceDuration) *
    peaks.length;
  const points: { x: number; amplitude: number }[] = [];
  for (let x = start; x <= end; x = Math.min(end, x + 2)) {
    const first = Math.max(0, Math.floor(sample(x))),
      after = Math.min(peaks.length, Math.max(first + 1, Math.ceil(sample(Math.min(end, x + 2)))));
    let peak = 0;
    for (let i = first; i < after; i++) {
      const value = peaks[i];
      if (value !== undefined && Number.isFinite(value)) peak = Math.max(peak, Math.abs(value));
    }
    points.push({ x, amplitude: Math.max(0.6, Math.min(1, peak) * amplitude) });
    if (x === end) break;
  }
  return points;
}
interface Entry {
  key: string;
  owner: Map<string, Entry>;
  paths: readonly Path2D[];
  points: number;
}
/** Native geometry only: retain at most 32 envelopes / 32k points, with explicit surface ownership. */
export function createTimelineWaveformPaths() {
  const owners = new WeakMap<readonly number[], Map<string, Entry>>(),
    recent = new Set<Entry>();
  let points = 0;
  return {
    read(item: TimelineCanvasClip, width: number): readonly Path2D[] | null {
      if (!item.peaks || typeof Path2D !== "function") return null;
      const key = [
        item.bounds.x,
        item.bounds.width,
        item.bounds.height,
        width,
        item.sourceIn,
        item.sourceDuration,
        item.duration,
      ].join(":");
      let owner = owners.get(item.peaks);
      if (!owner) {
        owner = new Map();
        owners.set(item.peaks, owner);
      }
      const prior = owner.get(key);
      if (prior) {
        recent.delete(prior);
        recent.add(prior);
        return prior.paths;
      }
      const envelope = waveformPoints(item, width);
      if (!envelope.length) return null;
      const bottom = item.bounds.height - 0.5;
      const paths = [1, 0.7].map((scale) => {
        const path = new Path2D();
        path.moveTo(envelope[0]!.x, bottom);
        path.lineTo(envelope[0]!.x, bottom - scale * envelope[0]!.amplitude);
        for (let i = 1; i < envelope.length; i++) {
          const previous = envelope[i - 1]!,
            current = envelope[i]!;
          path.quadraticCurveTo(
            previous.x,
            bottom - scale * previous.amplitude,
            (previous.x + current.x) / 2,
            bottom - (scale * (previous.amplitude + current.amplitude)) / 2,
          );
        }
        const last = envelope.at(-1)!;
        path.lineTo(last.x, bottom - scale * last.amplitude);
        path.lineTo(last.x, bottom);
        path.closePath();
        return path;
      });
      const entry = { key, owner, paths, points: envelope.length * 2 };
      owner.set(key, entry);
      recent.add(entry);
      points += entry.points;
      while (recent.size > 32 || points > 32768) {
        const oldest = recent.values().next().value!;
        recent.delete(oldest);
        oldest.owner.delete(oldest.key);
        points -= oldest.points;
      }
      return paths;
    },
    dispose() {
      for (const entry of recent) entry.owner.delete(entry.key);
      recent.clear();
      points = 0;
    },
  };
}
export type TimelineWaveformPaths = ReturnType<typeof createTimelineWaveformPaths>;

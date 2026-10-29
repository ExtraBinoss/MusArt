import { normalizeMotionTime, motionTimeToSeconds, type MotionTime } from "@musart/core";
import type { TimelineUnit } from "./model";

/** Pointer/input precision is explicit; the engine retains rational authored time. */
export function timelineTime(seconds: number): MotionTime {
  if (!Number.isFinite(seconds) || !Number.isSafeInteger(Math.round(seconds * 1_000_000)))
    throw new RangeError("Unrepresentable timeline time");
  return normalizeMotionTime({ value: Math.round(seconds * 1_000_000), rate: 1_000_000 });
}

export function formatTimelineTime(time: MotionTime, unit: TimelineUnit): string {
  const value = motionTimeToSeconds(time) * (unit === "ms" ? 1000 : 1);
  return String(Number(value.toFixed(unit === "ms" ? 3 : 6)));
}

export function parseTimelineTime(text: string, unit: TimelineUnit): MotionTime | null {
  if (!text.trim()) return null;
  const seconds = Number(text) / (unit === "ms" ? 1000 : 1);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  try {
    return timelineTime(seconds);
  } catch {
    return null;
  }
}

export function timelineTicks(
  start: number,
  width: number,
  pixelsPerSecond: number,
): { time: number; x: number }[] {
  if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0 || width <= 0) return [];
  const ideal = 80 / pixelsPerSecond;
  const magnitude = 10 ** Math.floor(Math.log10(ideal));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= ideal)! * magnitude;
  const first = Math.max(0, Math.floor(start / pixelsPerSecond / step));
  const count = Math.min(100, Math.ceil(width / (step * pixelsPerSecond)) + 2);
  return Array.from({ length: count }, (_, index) => {
    const time = (first + index) * step;
    return { time, x: time * pixelsPerSecond };
  });
}

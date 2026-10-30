import { compareMotionTime, type MotionTime } from "./time";

export interface MotionInterval {
  readonly start: MotionTime;
  readonly end: MotionTime;
}

/** Sorted disjoint interval intersection. No time-grid rounding or Cartesian expansion. */
export function intersectMotionIntervals(
  left: readonly MotionInterval[],
  right: readonly MotionInterval[],
): MotionInterval[] {
  const result: MotionInterval[] = [];
  let a = 0,
    b = 0;
  while (a < left.length && b < right.length) {
    const first = left[a]!,
      second = right[b]!;
    const start = compareMotionTime(first.start, second.start) >= 0 ? first.start : second.start;
    const end = compareMotionTime(first.end, second.end) <= 0 ? first.end : second.end;
    if (compareMotionTime(start, end) < 0) result.push({ start, end });
    const order = compareMotionTime(first.end, second.end);
    if (order <= 0) a++;
    if (order >= 0) b++;
  }
  return result;
}

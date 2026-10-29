import { ensure } from "../errors";

/** Portable exact time. Fractions may be signed; their rate is always positive. */
export interface MotionTime {
  readonly value: number;
  readonly rate: number;
}

export interface MotionFrameRate {
  readonly numerator: number;
  readonly denominator: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isMotionTime(value: unknown): value is MotionTime {
  return (
    record(value) &&
    Number.isSafeInteger(value.value) &&
    Number.isSafeInteger(value.rate) &&
    Number(value.rate) > 0
  );
}

export function validateMotionTime(value: unknown): asserts value is MotionTime {
  ensure(
    isMotionTime(value),
    "INVALID_DOCUMENT",
    "Motion time needs safe integer ticks and a positive rate.",
  );
}

export function isMotionFrameRate(value: unknown): value is MotionFrameRate {
  return (
    record(value) &&
    Number.isSafeInteger(value.numerator) &&
    Number(value.numerator) > 0 &&
    Number.isSafeInteger(value.denominator) &&
    Number(value.denominator) > 0
  );
}

export function validateMotionFrameRate(value: unknown): asserts value is MotionFrameRate {
  ensure(
    isMotionFrameRate(value),
    "INVALID_DOCUMENT",
    "Motion frame rate needs positive safe integer numerator and denominator.",
  );
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function normalizedRatio(value: bigint, rate: bigint): MotionTime {
  let left = value < 0n ? -value : value;
  let right = rate;
  while (right !== 0n) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  const numerator = value / left;
  const denominator = rate / left;
  if (numerator < -MAX_SAFE || numerator > MAX_SAFE || denominator > MAX_SAFE)
    throw new RangeError("Motion time cannot be represented with safe integer ticks and rate.");
  return { value: Number(numerator), rate: Number(denominator) };
}

export function normalizeMotionTime(time: MotionTime): MotionTime {
  validateMotionTime(time);
  return normalizedRatio(BigInt(time.value), BigInt(time.rate));
}

export function normalizeMotionFrameRate(fps: MotionFrameRate): MotionFrameRate {
  validateMotionFrameRate(fps);
  const ratio = normalizedRatio(BigInt(fps.numerator), BigInt(fps.denominator));
  return { numerator: ratio.value, denominator: ratio.rate };
}

/** Cross-products stay exact even when their intermediate values exceed safe integers. */
export function compareMotionTime(left: MotionTime, right: MotionTime): -1 | 0 | 1 {
  validateMotionTime(left);
  validateMotionTime(right);
  if (left.rate === right.rate)
    return left.value < right.value ? -1 : left.value > right.value ? 1 : 0;
  const leftProduct = left.value * right.rate;
  const rightProduct = right.value * left.rate;
  if (Number.isSafeInteger(leftProduct) && Number.isSafeInteger(rightProduct))
    return leftProduct < rightProduct ? -1 : leftProduct > rightProduct ? 1 : 0;
  const exactLeft = BigInt(left.value) * BigInt(right.rate);
  const exactRight = BigInt(right.value) * BigInt(left.rate);
  return exactLeft < exactRight ? -1 : exactLeft > exactRight ? 1 : 0;
}

export function addMotionTime(left: MotionTime, right: MotionTime): MotionTime {
  validateMotionTime(left);
  validateMotionTime(right);
  return normalizedRatio(
    BigInt(left.value) * BigInt(right.rate) + BigInt(right.value) * BigInt(left.rate),
    BigInt(left.rate) * BigInt(right.rate),
  );
}

export function subtractMotionTime(left: MotionTime, right: MotionTime): MotionTime {
  validateMotionTime(left);
  validateMotionTime(right);
  return normalizedRatio(
    BigInt(left.value) * BigInt(right.rate) - BigInt(right.value) * BigInt(left.rate),
    BigInt(left.rate) * BigInt(right.rate),
  );
}

/** Signed frame indices also describe pre-roll and clip offsets. Output bounds belong to the caller. */
export function frameTime(index: number, fps: MotionFrameRate): MotionTime {
  ensure(
    Number.isSafeInteger(index),
    "INVALID_DOCUMENT",
    "Motion frame index must be a safe integer.",
  );
  validateMotionFrameRate(fps);
  return normalizedRatio(BigInt(index) * BigInt(fps.denominator), BigInt(fps.numerator));
}

/** Approximate seconds are an API boundary, never the canonical stored time. */
export function motionTimeToSeconds(time: MotionTime): number {
  validateMotionTime(time);
  return time.value / time.rate;
}

/** Exact boundaries first; only the interpolation ratio is converted to floating point. */
export function motionTimeProgress(time: MotionTime, start: MotionTime, end: MotionTime): number {
  ensure(
    compareMotionTime(start, end) < 0,
    "INVALID_DOCUMENT",
    "Motion interval must have positive length.",
  );
  if (compareMotionTime(time, start) <= 0) return 0;
  if (compareMotionTime(time, end) >= 0) return 1;
  const elapsed =
    (BigInt(time.value) * BigInt(start.rate) - BigInt(start.value) * BigInt(time.rate)) *
    BigInt(end.rate);
  const duration =
    (BigInt(end.value) * BigInt(start.rate) - BigInt(start.value) * BigInt(end.rate)) *
    BigInt(time.rate);
  // A strictly interior rational time can round to 1 as a double. Keep HOLD/discrete
  // segments before their destination until the exact comparison above reaches it.
  return Math.min(1 - Number.EPSILON / 2, Number(elapsed) / Number(duration));
}

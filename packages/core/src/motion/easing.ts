import { ensure } from "../errors";

export type MotionEasing =
  | { readonly type: "linear" }
  | { readonly type: "hold" }
  | {
      readonly type: "cubicBezier";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    }
  | {
      readonly type: "spring";
      readonly bounce: number;
      /** Natural angular frequency over normalized progress, in [1, 40]; defaults to 12. */
      readonly response?: number;
    };

export const MOTION_EASING_PRESETS = Object.freeze([
  "linear",
  "hold",
  "easeIn",
  "easeOut",
  "easeInOut",
  "easeInBack",
  "easeOutBack",
  "easeInOutBack",
  "gentle",
  "quick",
  "bouncy",
  "slow",
] as const);

export type MotionEasingPreset = (typeof MOTION_EASING_PRESETS)[number];

const PRESETS: Readonly<Record<MotionEasingPreset, MotionEasing>> = Object.freeze({
  linear: Object.freeze({ type: "linear" }),
  hold: Object.freeze({ type: "hold" }),
  easeIn: Object.freeze({ type: "cubicBezier", x1: 0.42, y1: 0, x2: 1, y2: 1 }),
  easeOut: Object.freeze({ type: "cubicBezier", x1: 0, y1: 0, x2: 0.58, y2: 1 }),
  easeInOut: Object.freeze({ type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 }),
  easeInBack: Object.freeze({ type: "cubicBezier", x1: 0.36, y1: 0, x2: 0.66, y2: -0.56 }),
  easeOutBack: Object.freeze({ type: "cubicBezier", x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 }),
  easeInOutBack: Object.freeze({ type: "cubicBezier", x1: 0.68, y1: -0.6, x2: 0.32, y2: 1.6 }),
  gentle: Object.freeze({ type: "spring", bounce: 0.2, response: 8 }),
  quick: Object.freeze({ type: "spring", bounce: 0.1, response: 16 }),
  bouncy: Object.freeze({ type: "spring", bounce: 0.7, response: 14 }),
  slow: Object.freeze({ type: "spring", bounce: 0.15, response: 5 }),
});

export function createMotionEasingPreset(preset: MotionEasingPreset): MotionEasing {
  ensure(Object.hasOwn(PRESETS, preset), "INVALID_DOCUMENT", "Unknown Motion easing preset.");
  return PRESETS[preset];
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function unit(value: unknown): value is number {
  return finite(value) && value >= 0 && value <= 1;
}

export function isMotionEasing(value: unknown): value is MotionEasing {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const easing = value as Record<string, unknown>;
  if (easing.type === "linear" || easing.type === "hold")
    return Object.keys(easing).every((key) => key === "type");
  if (easing.type === "cubicBezier")
    return (
      unit(easing.x1) &&
      finite(easing.y1) &&
      unit(easing.x2) &&
      finite(easing.y2) &&
      Object.keys(easing).every((key) => ["type", "x1", "y1", "x2", "y2"].includes(key))
    );
  if (easing.type === "spring")
    return (
      unit(easing.bounce) &&
      (easing.response === undefined ||
        (finite(easing.response) && easing.response >= 1 && easing.response <= 40)) &&
      Object.keys(easing).every((key) => ["type", "bounce", "response"].includes(key))
    );
  return false;
}

export function validateMotionEasing(value: unknown): asserts value is MotionEasing {
  ensure(isMotionEasing(value), "INVALID_DOCUMENT", "Invalid Motion easing curve.");
}

function coordinate(time: number, first: number, second: number): number {
  const inverse = 1 - time;
  return (
    3 * inverse * inverse * time * first + 3 * inverse * time * time * second + time * time * time
  );
}

function derivative(time: number, first: number, second: number): number {
  const inverse = 1 - time;
  return (
    3 * inverse * inverse * first +
    6 * inverse * time * (second - first) +
    3 * time * time * (1 - second)
  );
}

function bezierParameter(progress: number, first: number, second: number): number {
  if (first === 0 && second === 0) return Math.cbrt(progress);
  if (first === 1 && second === 1) return 1 - Math.cbrt(1 - progress);
  let low = 0;
  let high = 1;
  let time = progress;
  // Leading terms provide stable starting points near flat horizontal endpoints.
  if (progress < 0.001)
    time = first > 0 ? progress / (3 * first) : Math.sqrt(progress / (3 * second));
  else if (progress > 0.999)
    time =
      second < 1
        ? 1 - (1 - progress) / (3 * (1 - second))
        : 1 - Math.sqrt((1 - progress) / (3 * (1 - first)));
  time = Math.max(0, Math.min(1, time));
  for (let iteration = 0; iteration < 48; iteration++) {
    const position = coordinate(time, first, second);
    if (position === progress) return time;
    if (position < progress) low = time;
    else high = time;
    const slope = derivative(time, first, second);
    const candidate = time - (position - progress) / slope;
    const next =
      iteration < 8 && Number.isFinite(candidate) && candidate > low && candidate < high
        ? candidate
        : (low + high) / 2;
    if (next === time) return time;
    time = next;
  }
  return time;
}

function springResponse(progress: number, bounce: number, response: number): number {
  const dampingRatio = 1 - 0.9 * bounce;
  const decay = dampingRatio * response;
  if (1 - dampingRatio < 1e-6)
    return 1 - (1 + response * progress) * Math.exp(-response * progress);
  const frequency = response * Math.sqrt(1 - dampingRatio * dampingRatio);
  return (
    1 -
    Math.exp(-decay * progress) *
      (Math.cos(frequency * progress) + (decay / frequency) * Math.sin(frequency * progress))
  );
}

/** Validates/captures a curve once, including its spring normalization, for a retained timeline. */
export function compileMotionEasing(easing: MotionEasing): (progress: number) => number {
  validateMotionEasing(easing);
  let sample: (progress: number) => number;
  switch (easing.type) {
    case "linear":
      sample = (progress) => progress;
      break;
    case "hold":
      sample = () => 0;
      break;
    case "cubicBezier": {
      const { x1, y1, x2, y2 } = easing;
      sample =
        x1 === y1 && x2 === y2
          ? (progress) => progress
          : (progress) => coordinate(bezierParameter(progress, x1, x2), y1, y2);
      break;
    }
    case "spring": {
      const response = easing.response ?? 12;
      const bounce = easing.bounce;
      // Normalize the analytic response so the destination is reached without a final discontinuity.
      const destination = springResponse(1, bounce, response);
      sample = (progress) => springResponse(progress, bounce, response) / destination;
      break;
    }
  }
  return (progress) => {
    ensure(Number.isFinite(progress), "INVALID_DOCUMENT", "Motion easing progress must be finite.");
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    return sample(progress);
  };
}

/** Incoming-segment progress; HOLD changes at its destination. No clock or previous sample is read. */
export function evaluateEasing(progress: number, easing: MotionEasing): number {
  return compileMotionEasing(easing)(progress);
}

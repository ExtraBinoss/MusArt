import { ensure } from "../errors";
import { compileMotionEasing, type MotionEasing } from "./easing";
import type { MotionPropertyDescriptor, MotionValue } from "./properties/model";
import { validateMotionValue } from "./properties/validation";

function channels(color: string): readonly number[] {
  if (color.toLowerCase() === "transparent") return [0, 0, 0, 0];
  let hex = color.slice(1);
  if (hex.length === 3 || hex.length === 4)
    hex = Array.from(hex)
      .map((digit) => digit + digit)
      .join("");
  if (hex.length === 6) hex += "ff";
  return [0, 2, 4, 6].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Registry values/curve are checked once; returned samplers never resolve document properties. */
export function compileMotionInterpolator(
  descriptor: MotionPropertyDescriptor,
  before: MotionValue,
  after: MotionValue,
  easing: MotionEasing = { type: "linear" },
): (progress: number) => MotionValue {
  validateMotionValue(descriptor, before);
  validateMotionValue(descriptor, after);
  const ease = compileMotionEasing(easing);
  let interpolate: (progress: number) => MotionValue;
  if (descriptor.interpolation === "hold") interpolate = () => before;
  else if (descriptor.kind === "number" || descriptor.kind === "integer") {
    const left = before as number;
    const distance = (after as number) - left;
    const { min, max, kind } = descriptor;
    interpolate = (progress) => {
      const value = left + distance * ease(progress);
      return clamp(kind === "integer" ? Math.round(value) : value, min, max);
    };
  } else if (descriptor.kind === "color") {
    const left = channels(before as string);
    const right = channels(after as string);
    const count = descriptor.format === "rgb" ? 3 : 4;
    interpolate = (progress) => {
      const amount = ease(progress);
      let color = "#";
      for (let channel = 0; channel < count; channel++)
        color += Math.round(
          clamp(left[channel]! + (right[channel]! - left[channel]!) * amount, 0, 255),
        )
          .toString(16)
          .padStart(2, "0");
      return color;
    };
  } else interpolate = () => before;
  return (progress) => {
    ensure(
      Number.isFinite(progress),
      "INVALID_DOCUMENT",
      "Motion interpolation progress must be finite.",
    );
    if (progress <= 0) return before;
    if (progress >= 1) return after;
    return interpolate(progress);
  };
}

import { assertColor, assertList, assertNumber, assertRecord } from "../document/guards";
import { ensure } from "../errors";

export interface GradientStop {
  offset: number;
  color: string;
}

/** Portable paint definition. Offsets are nondecreasing; equal stops create a hard edge. */
export interface FillGradient {
  kind: "linear" | "radial";
  angle: number;
  stops: GradientStop[];
}

export function validateFillGradient(value: unknown): asserts value is FillGradient {
  assertRecord(value);
  ensure(
    value.kind === "linear" || value.kind === "radial",
    "INVALID_DOCUMENT",
    "Unknown gradient kind",
  );
  assertNumber(value.angle, -360000, 360000);
  assertList(value.stops, 8);
  ensure(value.stops.length >= 2, "INVALID_DOCUMENT", "A gradient needs 2 to 8 stops");
  let previous = 0;
  for (const stop of value.stops) {
    assertRecord(stop);
    assertNumber(stop.offset, 0, 1);
    assertColor(stop.color);
    ensure(stop.offset >= previous, "INVALID_DOCUMENT", "Gradient stops must be ordered");
    previous = stop.offset;
  }
  const first = value.stops[0] as Record<string, unknown>,
    last = value.stops.at(-1) as Record<string, unknown>;
  ensure(
    first.offset === 0 && last.offset === 1,
    "INVALID_DOCUMENT",
    "Gradient endpoints must be 0 and 1",
  );
}

function rgba(color: string): number[] {
  if (color.toLowerCase() === "transparent") return [0, 0, 0, 0];
  let hex = color.slice(1);
  if (hex.length <= 4)
    hex = Array.from(hex)
      .map((digit) => digit + digit)
      .join("");
  if (hex.length === 6) hex += "ff";
  return [0, 2, 4, 6].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

/** Interpolates paint metadata when inserting a stop; it never inspects rendered pixels.
 * The renderer uses straight sRGB/RGBA interpolation, including alpha. */
export function sampleGradientColor(gradient: FillGradient, offset: number): string {
  validateFillGradient(gradient);
  assertNumber(offset, 0, 1);
  let left = gradient.stops[0]!;
  for (const right of gradient.stops.slice(1)) {
    if (offset < right.offset) {
      const amount = (offset - left.offset) / (right.offset - left.offset),
        before = rgba(left.color),
        after = rgba(right.color);
      return (
        "#" +
        before
          .map((value, index) =>
            Math.round(value + (after[index]! - value) * amount)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")
      );
    }
    left = right;
  }
  return (
    "#" +
    rgba(left.color)
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
  );
}

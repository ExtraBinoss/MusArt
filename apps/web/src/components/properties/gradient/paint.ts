import { sampleGradientColor, type FillGradient, type GradientStop } from "@musart/core";
import { normalizeHex } from "../color/conversion";

/** The ramp edits ordered stops independently of the paint's spatial angle/kind. */
export function gradientRamp(gradient: FillGradient): string {
  return `linear-gradient(90deg, ${gradient.stops
    .map((stop) => `${stop.color} ${stop.offset * 100}%`)
    .join(", ")})`;
}

export function stopBounds(gradient: FillGradient, index: number): [number, number] {
  if (index === 0) return [0, 0];
  if (index === gradient.stops.length - 1) return [1, 1];
  return [gradient.stops[index - 1]!.offset, gradient.stops[index + 1]!.offset];
}

export function replaceStop(
  gradient: FillGradient,
  index: number,
  change: Partial<GradientStop>,
): FillGradient {
  const [min, max] = stopBounds(gradient, index);
  const current = gradient.stops[index]!;
  const stop = { ...current, ...change };
  stop.offset = Math.max(min, Math.min(max, stop.offset));
  return { ...gradient, stops: gradient.stops.map((item, at) => (at === index ? stop : item)) };
}

export function insertStop(
  gradient: FillGradient,
): { gradient: FillGradient; index: number } | null {
  if (gradient.stops.length >= 8) return null;
  let width = -1,
    index = 1;
  for (let at = 1; at < gradient.stops.length; at++) {
    const gap = gradient.stops[at]!.offset - gradient.stops[at - 1]!.offset;
    if (gap > width) {
      width = gap;
      index = at;
    }
  }
  const offset = (gradient.stops[index - 1]!.offset + gradient.stops[index]!.offset) / 2;
  const stops = [...gradient.stops];
  stops.splice(index, 0, { offset, color: sampleGradientColor(gradient, offset) });
  return { gradient: { ...gradient, stops }, index };
}

export function stopColorFields(color: string): { hex: string; opacity: number } {
  const normalized = normalizeHex(color)!;
  return {
    hex: normalized.slice(0, 7).toUpperCase(),
    opacity: normalized.length === 9 ? (parseInt(normalized.slice(7), 16) / 255) * 100 : 100,
  };
}

export function withOpacity(color: string, opacity: number): string {
  const hex = normalizeHex(color)!.slice(0, 7);
  const alpha = Math.round((Math.max(0, Math.min(100, opacity)) / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return normalizeHex(`${hex}${alpha}`)!;
}

/** Six-digit RGB edits keep the independent alpha field; explicit RGBA edits replace it. */
export function withHexColor(color: string, value: string): string | null {
  const normalized = normalizeHex(value);
  if (!normalized) return null;
  if (value.length === 5 || value.length === 9 || value.toLowerCase() === "transparent")
    return normalized;
  return withOpacity(normalized, stopColorFields(color).opacity);
}

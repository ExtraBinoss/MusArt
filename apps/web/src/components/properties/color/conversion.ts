export interface Hsva {
  h: number;
  s: number;
  v: number;
  a: number;
}
const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
export function normalizeHex(value: string): string | null {
  if (value.toLowerCase() === "transparent") return "#00000000";
  if (!/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) return null;
  let hex = value.slice(1).toLowerCase();
  if (hex.length <= 4) hex = Array.from(hex, (character) => character + character).join("");
  return `#${hex.length === 8 && hex.endsWith("ff") ? hex.slice(0, 6) : hex}`;
}
export function hexToHsva(value: string): Hsva {
  const normalized = normalizeHex(value);
  if (!normalized) throw new Error("Unsupported editor color.");
  const hex = normalized.slice(1),
    rgb = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = rgb as [number, number, number],
    maximum = Math.max(r, g, b),
    difference = maximum - Math.min(r, g, b);
  let h = difference
    ? maximum === r
      ? (g - b) / difference
      : maximum === g
        ? (b - r) / difference + 2
        : (r - g) / difference + 4
    : 0;
  h = (h * 60 + 360) % 360;
  return {
    h,
    s: maximum ? (difference / maximum) * 100 : 0,
    v: maximum * 100,
    a: hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1,
  };
}
export function hsvaToHex(color: Hsva): string {
  if (![color.h, color.s, color.v, color.a].every(Number.isFinite))
    throw new Error("Color channels must be finite.");
  const hue = (((color.h % 360) + 360) % 360) / 60,
    saturation = clamp(color.s, 100) / 100,
    value = clamp(color.v, 100) / 100;
  const chroma = value * saturation,
    secondary = chroma * (1 - Math.abs((hue % 2) - 1)),
    base = value - chroma;
  const sectors = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ];
  const bytes = [
    ...sectors[Math.floor(hue)]!.map((channel) => Math.round((channel + base) * 255)),
    Math.round(clamp(color.a, 1) * 255),
  ];
  const hex = bytes.map((channel) => channel.toString(16).padStart(2, "0")).join("");
  return normalizeHex(`#${hex}`)!;
}

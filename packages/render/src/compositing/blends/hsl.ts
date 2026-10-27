import { dot, max, min, vec3 } from "three/tsl";
import type { RGB } from "./types";
const luminance = (color: RGB) => dot(color, vec3(0.3, 0.59, 0.11));
const saturation = (color: RGB) =>
  max(max(color.r, color.g), color.b).sub(min(min(color.r, color.g), color.b));
export function clipColor(color: RGB) {
  const l = luminance(color);
  const low = min(min(color.r, color.g), color.b);
  const high = max(max(color.r, color.g), color.b);
  const lower = vec3(l).add(
    color
      .sub(l)
      .mul(l)
      .div(max(l.sub(low), 0.000001)),
  );
  const a = low.lessThan(0).select(lower, color);
  const upper = vec3(l).add(
    a
      .sub(l)
      .mul(l.oneMinus())
      .div(max(high.sub(l), 0.000001)),
  );
  return high.greaterThan(1).select(upper, a);
}
export function setLuminance(color: RGB, value: ReturnType<typeof luminance>) {
  return clipColor(color.add(value.sub(luminance(color))));
}
export function setSaturation(color: RGB, value: ReturnType<typeof saturation>) {
  const low = min(min(color.r, color.g), color.b);
  const high = max(max(color.r, color.g), color.b);
  return color
    .sub(low)
    .mul(value)
    .div(max(high.sub(low), 0.000001));
}
export const hue = (b: RGB, s: RGB) => setLuminance(setSaturation(s, saturation(b)), luminance(b));
export const saturationBlend = (b: RGB, s: RGB) =>
  setLuminance(setSaturation(b, saturation(s)), luminance(b));
export const color = (b: RGB, s: RGB) => setLuminance(s, luminance(b));
export const luminosity = (b: RGB, s: RGB) => setLuminance(b, luminance(s));

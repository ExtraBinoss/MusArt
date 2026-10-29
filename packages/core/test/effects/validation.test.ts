import { expect, it } from "vitest";
import { validateEffectExtensions } from "../../src/effects/validation";
it("accepts backward-compatible optional extension data and rejects malformed portable settings", () => {
  expect(() => validateEffectExtensions({})).not.toThrow();
  expect(() =>
    validateEffectExtensions({
      type: "gradient",
      blendMode: "multiply",
      opacity: 0.5,
      composite: "xor",
      time: 5,
      settings: { style: "silk", color0: "#abcdef", colorCount: 4 },
    }),
  ).not.toThrow();
  for (const value of [
    { blendMode: "__proto__" },
    { opacity: 2 },
    { time: -1 },
    { composite: "wat" },
    { type: "dither", settings: {} },
    { type: "gradient", settings: null },
    { type: "gradient", settings: { wat: 1 } },
    { type: "gradient", settings: { colorCount: 3.5 } },
    { type: "gradient", settings: { color0: "#fff" } },
  ])
    expect(() => validateEffectExtensions(value)).toThrow();
});
it("validates effect-owned settings independently, including booleans and extended spatial ranges", () => {
  expect(() =>
    validateEffectExtensions({
      type: "ripple",
      settings: { radius: 8192, amplitude: 0, direction: "inward" },
    }),
  ).not.toThrow();
  expect(() =>
    validateEffectExtensions({
      type: "shatter",
      settings: { cutout: true, ior: 1.52, tintColor: "#aabbcc" },
    }),
  ).not.toThrow();
  for (const value of [
    { type: "ripple", settings: { radius: 8193 } },
    { type: "ripple", settings: { direction: "sideways" } },
    { type: "ripple", settings: { color0: "#aabbcc" } },
    { type: "shatter", settings: { cutout: 1 } },
    { type: "shatter", settings: { pattern: "silk" } },
  ])
    expect(() => validateEffectExtensions(value)).toThrow();
});

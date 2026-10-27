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

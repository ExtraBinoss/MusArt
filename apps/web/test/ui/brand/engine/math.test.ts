import { expect, test } from "vitest";
import {
  clamp,
  createRng,
  easings,
  lerp,
  loopNoise,
  r2,
  TAU,
} from "../../../../src/ui/brand/engine/math";
test("keeps interpolation bounded, periodic motion deterministic and independent random streams repeatable", () => {
  expect(TAU).toBeCloseTo(Math.PI * 2);
  expect(clamp(-1)).toBe(0);
  expect(clamp(2)).toBe(1);
  expect(clamp(0.3)).toBe(0.3);
  expect(lerp(10, 30, 0.25)).toBe(15);
  expect(r2(1.234)).toBe(1.23);
  for (const ease of Object.values(easings)) {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.25)).toBeGreaterThanOrEqual(0);
  }
  expect(loopNoise(2.3, 5, 7)).toBeCloseTo(loopNoise(7.3, 5, 7), 10);
  const a = createRng(7),
    b = createRng(7),
    c = createRng(8);
  const values = Array.from({ length: 32 }, () => a());
  expect(values).toEqual(Array.from({ length: 32 }, () => b()));
  expect(values[0]).not.toBe(c());
  expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
});

import { expect, it, vi } from "vitest";
import { DrawingDensity } from "../../../src/canvas/render/drawing-density";
it("keeps Fiber's retained resize DPR configuration aligned with the actual render density", () => {
  const density = new DrawingDensity(),
    retained = density.bounds,
    setDpr = vi.fn();
  density.apply(4, setDpr);
  expect(density.bounds).toBe(retained);
  expect(retained).toEqual([4, 4]);
  expect(setDpr).toHaveBeenLastCalledWith(4);
  // Fiber clamps devicePixelRatio to its retained tuple each time size changes.
  const resizeDpr = (device: number) => Math.max(retained[0], Math.min(retained[1], device));
  expect(resizeDpr(1)).toBe(4);
  expect(192 * resizeDpr(1)).toBe(768);
  density.apply(2, setDpr);
  expect(resizeDpr(1)).toBe(2);
  expect(setDpr).toHaveBeenLastCalledWith(2);
  for (const invalid of [0, -1, NaN, Infinity])
    expect(() => density.apply(invalid, setDpr)).toThrow("density");
  expect(retained).toEqual([2, 2]);
  expect(setDpr).toHaveBeenCalledTimes(2);
});

import { expect, it, vi } from "vitest";
import { DrawingDensity } from "../../../src/canvas/render/drawing-density";
it("keeps Fiber's retained resize DPR configuration aligned with the actual render density", () => {
  const density = new DrawingDensity(),
    retained = density.bounds,
    setDpr = vi.fn();
  density.apply(4, setDpr, 768, 560);
  expect(density.bounds).toBe(retained);
  expect(retained).toEqual([4, 4]);
  expect(setDpr).toHaveBeenLastCalledWith(4);
  // Fiber clamps devicePixelRatio to its retained tuple each time size changes.
  const resizeDpr = (device: number) => Math.max(retained[0], Math.min(retained[1], device));
  expect(resizeDpr(1)).toBe(4);
  expect(192 * resizeDpr(1)).toBe(768);
  density.apply(2, setDpr, 384, 280);
  expect(resizeDpr(1)).toBe(2);
  expect(setDpr).toHaveBeenLastCalledWith(2);
  for (const invalid of [0, -1, NaN, Infinity])
    expect(() => density.apply(invalid, setDpr, 384, 280)).toThrow("density");
  expect(retained).toEqual([2, 2]);
  expect(setDpr).toHaveBeenCalledTimes(2);
});

it("presents exact non-square frame dimensions and repairs Fiber resizes without redundant buffer writes", () => {
  const density = new DrawingDensity(),
    canvas = document.createElement("canvas"),
    setDpr = vi.fn();
  canvas.width = 158;
  canvas.height = 3;
  canvas.style.width = "778px";
  canvas.style.height = "17px";
  const css = canvas.style.cssText;
  const renderer = {
    domElement: canvas,
    setDrawingBufferSize: vi.fn((width: number, height: number, _ratio: number) => {
      canvas.width = width;
      canvas.height = height;
    }),
  };
  density.prepare(renderer);
  expect(renderer.setDrawingBufferSize).not.toHaveBeenCalled();
  density.apply(0.20435, setDpr, 159, 4);
  density.prepare(renderer);
  expect(renderer.setDrawingBufferSize).toHaveBeenLastCalledWith(159, 4, 1);
  expect([canvas.width, canvas.height]).toEqual([159, 4]);
  expect(canvas.style.cssText).toBe(css);
  density.prepare(renderer);
  expect(renderer.setDrawingBufferSize).toHaveBeenCalledTimes(1);
  canvas.width = 158;
  density.prepare(renderer);
  expect(renderer.setDrawingBufferSize).toHaveBeenCalledTimes(2);
  expect([canvas.width, canvas.height]).toEqual([159, 4]);
  for (const invalid of [0, -1, 0.5, NaN, Infinity]) {
    expect(() => density.apply(1, setDpr, invalid, 4)).toThrow("dimensions");
    expect(() => density.apply(1, setDpr, 159, invalid)).toThrow("dimensions");
  }
  expect(density.bounds).toEqual([0.20435, 0.20435]);
  expect(setDpr).toHaveBeenCalledTimes(1);
});

import { describe, expect, it } from "vitest";
import {
  clientToPage,
  constrainView,
  fitView,
  INITIAL_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  pan,
  wheelPixels,
  WHEEL_PAN_SPEED,
  wheelZoomFactor,
  zoomAt,
} from "../../../src/canvas/viewport/view";
describe("trackpad viewport math", () => {
  it("pans in both axes without changing zoom", () =>
    expect(pan({ x: 10, y: 20, zoom: 2 }, 30, -4)).toEqual({ x: -20, y: 24, zoom: 2 }));
  it("keeps the document point under the zoom anchor stable", () => {
    const view = { x: 50, y: -20, zoom: 1.5 };
    const anchor = { x: 200, y: 100 };
    const next = zoomAt(view, 2, anchor);
    expect((anchor.x - next.x) / next.zoom).toBe((anchor.x - view.x) / view.zoom);
    expect((anchor.y - next.y) / next.zoom).toBe((anchor.y - view.y) / view.zoom);
    expect(zoomAt(view, 10000, anchor).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(view, 0, anchor).zoom).toBe(MIN_ZOOM);
  });
  it("maps client coordinates through viewport origin, pan and zoom", () => {
    expect(
      clientToPage(
        { x: 610, y: 460 },
        { left: 10, top: 20, width: 800, height: 600 },
        { x: 100, y: 40, zoom: 2 },
        { width: 1000, height: 500 },
      ),
    ).toEqual({ x: 550, y: 300 });
  });
  it("normalizes wheel pixel, line and page deltas", () => {
    expect(wheelPixels(2, 0, 800)).toBe(2);
    expect(wheelPixels(2, 1, 800)).toBe(32);
    expect(wheelPixels(2, 2, 800)).toBe(1600);
    expect(WHEEL_PAN_SPEED).toBe(0.5);
  });
  it("normalizes zoom wheel units, reduces sensitivity and caps individual spikes", () => {
    expect(wheelZoomFactor(-40, 0, 800)).toBeCloseTo(Math.exp(0.08));
    expect(wheelZoomFactor(-2, 1, 800)).toBeCloseTo(Math.exp(0.064));
    expect(wheelZoomFactor(-1, 2, 800)).toBeCloseTo(Math.exp(0.16));
    expect(wheelZoomFactor(-10000, 0, 800)).toBeCloseTo(Math.exp(0.16));
    expect(wheelZoomFactor(10000, 0, 800)).toBeCloseTo(Math.exp(-0.16));
    expect(wheelZoomFactor(Infinity, 0, 800)).toBe(1);
  });
  it("bounds travel in both directions while preserving zoom and useful workspace around the page", () => {
    const viewport = { width: 1000, height: 800 };
    const page = { width: 200, height: 160 };
    const view = { x: 40, y: -70, zoom: 1 };
    expect(constrainView(view, page, viewport)).toBe(view);
    expect(constrainView({ x: 10000, y: -10000, zoom: 1 }, page, viewport)).toEqual({
      x: 240,
      y: -240,
      zoom: 1,
    });
    expect(
      constrainView({ x: -10000, y: 10000, zoom: 2 }, { width: 3000, height: 2000 }, viewport),
    ).toEqual({
      x: -2740,
      y: 1840,
      zoom: 2,
    });
    expect(constrainView({ x: 100, y: -100, zoom: 1 }, page, { width: 100, height: 80 })).toEqual({
      x: 80,
      y: -64,
      zoom: 1,
    });
  });
  it("fits large pages, preserves 100% for small pages, and clamps tiny viewports", () => {
    expect(fitView({ width: 1000, height: 1000 }, { width: 660, height: 1160 })).toEqual({
      x: 0,
      y: 0,
      zoom: 0.5,
    });
    expect(fitView({ width: 100, height: 100 }, { width: 600, height: 400 })).toEqual(INITIAL_VIEW);
    expect(fitView({ width: 1000, height: 1000 }, { width: 10, height: 10 }).zoom).toBe(MIN_ZOOM);
  });
});

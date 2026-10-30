import { afterEach, expect, it, vi } from "vitest";
import { createTimelineWaveformPaths } from "../../../../src/components/motion/canvas/waveform-paths";
import type { TimelineCanvasClip } from "../../../../src/components/motion/canvas/model";
const made = vi.fn();
class NativePath {
  constructor() {
    made();
  }
  moveTo = vi.fn();
  lineTo = vi.fn();
  quadraticCurveTo = vi.fn();
  closePath = vi.fn();
}
function fixture(): TimelineCanvasClip {
  const bounds = { x: 0, y: 3, width: 100, height: 18 };
  return {
    kind: "audio",
    hit: { kind: "audio", rowKey: "sound", rowIndex: 0, trackId: "sound", bounds },
    bounds,
    selected: false,
    media: true,
    mediaKind: "audio",
    muted: false,
    label: "Sound",
    peaks: [0, 0.5, 1, 0.5, 0],
    sourceIn: 0,
    sourceDuration: 2,
    duration: 2,
    trims: [],
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  made.mockClear();
});
it("reuses native waveform geometry across vertical row positions while invalidating changed sources and scale", () => {
  vi.stubGlobal("Path2D", NativePath);
  const cache = createTimelineWaveformPaths(),
    item = fixture();
  const first = cache.read(item, 100);
  expect(first).toHaveLength(2);
  expect(cache.read({ ...item, bounds: { ...item.bounds, y: 300 } }, 100)).toBe(first);
  expect(made).toHaveBeenCalledTimes(2);
  expect(cache.read({ ...item, sourceIn: 0.25 }, 100)).not.toBe(first);
  expect(cache.read({ ...item, peaks: [0, 0.5, 1, 0.5, 0] }, 100)).not.toBe(first);
  expect(cache.read({ ...item, bounds: { ...item.bounds, width: 200 } }, 100)).not.toBe(first);
  cache.dispose();
  expect(cache.read(item, 100)).not.toBe(first);
  cache.dispose();
});
it("bounds native resources, evicts the oldest contour and supports contexts without Path2D", () => {
  vi.stubGlobal("Path2D", NativePath);
  const cache = createTimelineWaveformPaths(),
    item = fixture(),
    first = cache.read(item, 100);
  for (let x = 1; x <= 33; x++) cache.read({ ...item, bounds: { ...item.bounds, x } }, 100);
  expect(cache.read(item, 100)).not.toBe(first);
  cache.dispose();
  vi.stubGlobal("Path2D", undefined);
  expect(cache.read(item, 100)).toBeNull();
});

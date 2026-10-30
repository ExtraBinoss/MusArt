import { afterEach, expect, it, vi } from "vitest";
import {
  createTimelineCanvasSurface,
  timelineCanvasAllocation,
  TIMELINE_CANVAS_BYTES,
  TIMELINE_ZOOM_PRESENT,
} from "../../../../src/components/motion/canvas/surface";
import * as projection from "../../../../src/components/motion/canvas/projection";
import { canvasContext, canvasFixture } from "./support";

afterEach(() => {
  delete document.documentElement.dataset.layerReorderActive;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture() {
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  let now = 0;
  vi.spyOn(window.performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  const resize: (() => void)[] = [],
    themes: (() => void)[] = [];
  const disconnectResize = vi.fn(),
    disconnectTheme = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize.push(callback);
      }
      observe() {}
      disconnect = disconnectResize;
    },
  );
  vi.stubGlobal(
    "MutationObserver",
    class {
      constructor(callback: () => void) {
        themes.push(callback);
      }
      observe() {}
      disconnect = disconnectTheme;
    },
  );
  const context = canvasContext();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((kind: string) =>
    kind === "2d" ? (context as never) : null,
  );
  const viewport = document.createElement("div"),
    frame = document.createElement("div"),
    canvas = document.createElement("canvas");
  frame.append(canvas);
  viewport.append(frame);
  let width = 644,
    height = 80;
  Object.defineProperties(viewport, {
    clientWidth: { get: () => width },
    clientHeight: { get: () => height },
  });
  const onError = vi.fn();
  const surface = createTimelineCanvasSurface({ viewport, frame, canvas, onError });
  const flush = () => {
    const pending = [...frames];
    frames.clear();
    for (const [, callback] of pending) callback(0);
  };
  return {
    surface,
    canvas,
    frame,
    viewport,
    frames,
    context,
    onError,
    themes,
    clock(value: number) {
      now = value;
    },
    disconnectResize,
    disconnectTheme,
    flush,
    resize(nextWidth: number, nextHeight: number) {
      width = nextWidth;
      height = nextHeight;
      for (const callback of resize) callback();
    },
  };
}

it("draws one viewport and coalesces updates without repainting unchanged playback presentation", () => {
  const d = fixture(),
    data = canvasFixture();
  d.surface.update(data.model);
  d.surface.invalidate();
  expect(d.frames.size).toBe(1);
  d.flush();
  expect(d.frames.size).toBe(0);
  expect(d.canvas.dataset).toMatchObject({
    timelineWidth: "400",
    timelineHeight: "48",
    timelinePaints: "1",
    timelineFirstRow: "0",
    timelineLastRow: "2",
    timelineSelectedKeys: "0",
    timelineHoverRow: "",
    timelineHoverKind: "",
    scale: "100",
  });
  expect(d.frame.style.width).toBe("400px");
  d.surface.update({ ...data.model });
  expect(d.frames.size).toBe(0);
  expect(d.surface.hitTest(50, 12)).toMatchObject({ kind: "clip", trackId: "first" });
  const hover = d.surface.hitTest(50, 12);
  d.surface.update({ ...data.model, hoverHit: hover });
  d.flush();
  d.surface.update({ ...data.model, hoverHit: d.surface.hitTest(51, 12) });
  expect(d.frames.size).toBe(0);
  d.surface.update({
    ...data.model,
    selectionPreview: {
      base: new Set(),
      ranges: [{ propertyId: "position", first: 0, after: 1 }],
    },
  });
  expect(d.frames.size).toBe(1);
  d.flush();
  expect(d.frames.size).toBe(0);
  d.surface.dispose();
});

it("uses current native scroll for hit testing before the queued paint and releases all owned work", () => {
  const d = fixture(),
    data = canvasFixture();
  d.surface.update(data.model);
  d.flush();
  d.viewport.scrollLeft = 130;
  d.viewport.scrollTop = 24;
  d.viewport.dispatchEvent(new Event("scroll"));
  expect(d.surface.hitTest(20, 12)).toBeNull();
  d.flush();
  expect(d.canvas.dataset).toMatchObject({
    timelineTop: "24",
    timelineLeft: "130",
    timelineFirstRow: "1",
  });
  d.resize(844, 104);
  d.flush();
  expect(d.canvas.dataset).toMatchObject({ timelineWidth: "600", timelineHeight: "72" });
  d.themes[0]!();
  d.flush();
  d.surface.invalidate();
  expect(d.frames.size).toBe(1);
  d.surface.dispose();
  expect(d.frames.size).toBe(0);
  expect(d.disconnectResize).toHaveBeenCalledOnce();
  expect(d.disconnectTheme).toHaveBeenCalledTimes(2);
  expect(d.canvas.width * d.canvas.height).toBe(1);
  d.surface.update(data.model);
  d.surface.invalidate();
  d.viewport.dispatchEvent(new Event("scroll"));
  expect(d.surface.hitTest(50, 12)).toBeNull();
  expect(d.frames.size).toBe(0);
});

it("presents a changed zoom and current scroll in the ruler's layout frame", () => {
  const d = fixture(),
    data = canvasFixture();
  d.surface.update(data.model);
  d.flush();
  d.resize(744, 104);
  d.surface.update({ ...data.model, scale: 200 });
  expect(d.canvas.dataset.scale).toBe("100");
  // The child publishes its model before the parent applies the new native anchor.
  d.viewport.scrollLeft = 30;
  d.viewport.dispatchEvent(new Event(TIMELINE_ZOOM_PRESENT));
  expect(d.canvas.dataset).toMatchObject({
    scale: "200",
    timelineLeft: "30",
    timelineWidth: "500",
    timelineHeight: "72",
    timelinePaints: "2",
  });
  expect(d.surface.hitTest(30, 12)).toMatchObject({ kind: "clip", trackId: "first" });
  expect(d.frames.size).toBe(0);
  d.surface.dispose();
});

it("bounds DPR, nonfinite device values and huge viewport backing allocations before assigning canvas size", () => {
  for (const ratio of [1, 4, 12, Infinity, NaN, -1, 0]) {
    const allocation = timelineCanvasAllocation(4000, 2000, ratio);
    expect(allocation.bytes).toBeLessThanOrEqual(TIMELINE_CANVAS_BYTES);
    expect(allocation.ratio).toBeLessThanOrEqual(4);
    expect(allocation.width).toBeLessThanOrEqual(8192);
    expect(allocation.height).toBeLessThanOrEqual(8192);
  }
  expect(timelineCanvasAllocation(1000000, 1000000, 4).bytes).toBeLessThanOrEqual(
    TIMELINE_CANVAS_BYTES,
  );
  expect(timelineCanvasAllocation(0, 0, 1)).toMatchObject({ width: 1, height: 1, bytes: 4 });
  expect(() => timelineCanvasAllocation(Infinity, 2, 1)).toThrow(RangeError);
});

it("routes real unavailable-context failures and never starts a retry loop", () => {
  const d = fixture();
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
  d.surface.update(canvasFixture().model);
  d.flush();
  expect(d.onError).toHaveBeenCalledOnce();
  expect(d.onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  expect(d.frames.size).toBe(0);
  d.surface.dispose();
});
it("runs the glyph fade only for drag entry/exit, never restarts it for a changed delta, and returns idle", () => {
  const d = fixture(),
    data = canvasFixture();
  d.surface.update(data.model);
  d.flush();
  const draft = {
    action: "keys" as const,
    delta: { value: 1, rate: 2 },
    keyIds: new Set(["b"]),
    layerIds: new Set<string>(),
  };
  d.surface.update({ ...data.model, draft });
  d.flush();
  expect(d.frames.size).toBe(1);
  d.clock(50);
  d.surface.update({ ...data.model, draft: { ...draft, delta: { value: 3, rate: 4 } } });
  d.flush();
  expect(d.canvas.dataset.timelineGlyphOpacity).toBe("0.5");
  d.clock(100);
  d.flush();
  expect(d.canvas.dataset.timelineGlyphOpacity).toBe("0");
  expect(d.frames.size).toBe(0);
  d.surface.update(data.model);
  d.clock(150);
  d.flush();
  expect(d.canvas.dataset.timelineGlyphOpacity).toBe("0.5");
  d.clock(200);
  d.flush();
  expect(d.canvas.dataset.timelineGlyphOpacity).toBe("1");
  expect(d.frames.size).toBe(0);
  d.surface.update({ ...data.model, draft });
  d.flush();
  d.surface.dispose();
  expect(d.frames.size).toBe(0);
});
it("honors reduced motion immediately without starting a glyph animation clock", () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
  const d = fixture(),
    data = canvasFixture();
  d.surface.update({
    ...data.model,
    draft: {
      action: "move",
      delta: { value: 1, rate: 2 },
      trackId: "first",
      keyIds: new Set(),
      layerIds: new Set(["hero"]),
    },
  });
  d.flush();
  expect(d.canvas.dataset.timelineGlyphOpacity).toBe("0");
  expect(d.frames.size).toBe(0);
  d.surface.dispose();
});
it("reads native label poses only during explicit reorder and returns to idle after the real animation ends", () => {
  const d = fixture(),
    data = canvasFixture();
  vi.spyOn(d.frame, "getBoundingClientRect").mockReturnValue({ top: 100 } as DOMRect);
  const label = document.createElement("div");
  label.dataset.labelsOnly = "true";
  label.dataset.motionRowKey = "hero";
  const rect = vi
    .spyOn(label, "getBoundingClientRect")
    .mockReturnValue({ top: 112, height: 24 } as DOMRect);
  let running = true;
  Object.defineProperty(label, "getAnimations", {
    value: () => (running ? [{ playState: "running", pending: false }] : []),
  });
  d.viewport.append(label);
  d.surface.update(data.model);
  d.flush();
  expect(rect).not.toHaveBeenCalled();
  document.documentElement.dataset.layerReorderActive = "true";
  d.themes[1]!();
  d.flush();
  expect(rect).toHaveBeenCalledOnce();
  expect(d.surface.hitTest(50, 20)).toMatchObject({ kind: "clip", bounds: { y: 15 } });
  expect(JSON.parse(d.canvas.dataset.timelineRowPositions!)).toContainEqual(["hero", 12]);
  expect(d.frames.size).toBe(1);
  delete document.documentElement.dataset.layerReorderActive;
  d.themes[1]!();
  d.flush();
  expect(d.frames.size).toBe(1);
  running = false;
  d.flush();
  expect(d.frames.size).toBe(0);
  const reads = rect.mock.calls.length;
  d.surface.invalidate();
  d.flush();
  expect(rect.mock.calls.length).toBe(reads);
  d.surface.dispose();
});

it("parks a stationary held reorder until new geometry arrives instead of repainting idle frames", () => {
  const d = fixture(),
    data = canvasFixture();
  d.surface.update(data.model);
  d.flush();
  document.documentElement.dataset.layerReorderActive = "true";
  d.themes[1]!();
  d.flush();
  expect(d.frames.size).toBe(0);
  delete document.documentElement.dataset.layerReorderActive;
  d.themes[1]!();
  d.flush();
  expect(d.canvas.dataset.timelineRowPositions).toBe("");
  expect(d.frames.size).toBe(0);
  d.surface.dispose();
});

it("reuses projected geometry for hover-only paints, including the first paint after scroll hit testing", () => {
  const d = fixture(),
    data = canvasFixture();
  const project = vi.spyOn(projection, "projectTimelineCanvas");
  d.surface.update(data.model);
  d.flush();
  expect(project).toHaveBeenCalledOnce();
  project.mockClear();
  d.surface.update({ ...data.model, hoverHit: d.surface.hitTest(50, 12) });
  d.flush();
  expect(project).not.toHaveBeenCalled();
  expect(d.canvas.dataset.timelineHoverKind).toBe("clip");
  d.viewport.scrollLeft = 20;
  d.viewport.dispatchEvent(new Event("scroll"));
  const pointed = d.surface.hitTest(95, 12);
  d.surface.update({ ...data.model, hoverHit: pointed });
  d.flush();
  expect(project).toHaveBeenCalledOnce();
  project.mockClear();
  d.surface.update({ ...data.model, selectedLayerIds: new Set(["hero"]), hoverHit: pointed });
  d.flush();
  expect(project).toHaveBeenCalledOnce();
  d.surface.dispose();
});

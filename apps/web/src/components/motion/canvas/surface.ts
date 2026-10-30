import { createTimelineCanvasFrameQueue } from "./frame-queue";
import { projectTimelineCanvas, hitTestTimelineCanvas } from "./projection";
import { createTimelineWaveformPaths } from "./waveform-paths";
import { paintTimelineCanvas } from "./paint";
import { createTimelineCanvasRowPositions } from "./row-positions";
import type {
  TimelineCanvasModel,
  TimelineCanvasHit,
  TimelineCanvasPalette,
  TimelineCanvasScene,
  TimelineCanvasSurface,
  TimelineCanvasViewport,
} from "./model";

export const TIMELINE_CANVAS_BYTES = 16 * 1024 * 1024;
export const TIMELINE_ZOOM_PRESENT = "musart:timeline-zoom-present";
const MAX_DIMENSION = 8192;

/** A viewport allocation, independent of document duration, track count and scroll extent. */
export function timelineCanvasAllocation(width: number, height: number, deviceRatio: number) {
  if (![width, height].every(Number.isFinite) || width < 0 || height < 0)
    throw new RangeError("Invalid timeline canvas dimensions.");
  const desired = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  const ratio = Math.min(
    4,
    desired,
    Math.sqrt(TIMELINE_CANVAS_BYTES / (4 * Math.max(1, width) * Math.max(1, height))),
    MAX_DIMENSION / Math.max(1, width),
    MAX_DIMENSION / Math.max(1, height),
  );
  const physicalWidth = Math.max(1, Math.floor(width * ratio));
  const physicalHeight = Math.max(1, Math.floor(height * ratio));
  return {
    width: physicalWidth,
    height: physicalHeight,
    ratio,
    bytes: physicalWidth * physicalHeight * 4,
  };
}

export interface TimelineCanvasSurfaceOptions {
  readonly canvas: HTMLCanvasElement;
  /** Inner absolute root, inside the host's zero-height sticky wrapper. */
  readonly frame: HTMLElement;
  readonly viewport: HTMLElement;
  readonly bodyTop?: number;
  readonly onError?: (error: unknown) => void;
}

function paletteFor(element: HTMLElement): TimelineCanvasPalette {
  const style = element.ownerDocument.defaultView!.getComputedStyle(element);
  const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const background = color("--background", "#ffffff"),
    foreground = color("--foreground", "#171717"),
    muted = color("--muted-foreground", "#737373");
  return {
    background,
    foreground,
    muted,
    border: color("--border", "#d4d4d4"),
    track: `color-mix(in srgb, ${muted} 22%, ${background})`,
    trackHover: `color-mix(in srgb, ${muted} 32%, ${background})`,
    trackSelected: color("--motion-accent", "#3b82f6"),
    keySelected: color("--primary", "#3b82f6"),
    image: color("--media-image", "#3b82f6"),
    video: color("--media-video", "#8b5cf6"),
    audio: color("--media-audio", "#16a34a"),
  };
}

function sameHover(
  a: TimelineCanvasHit | null | undefined,
  b: TimelineCanvasHit | null | undefined,
) {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind || a.rowKey !== b.rowKey) return false;
  if ("keyId" in a && "keyId" in b) return a.keyId === b.keyId;
  if ("trackId" in a && "trackId" in b) return a.trackId === b.trackId;
  return a.kind === "gap" && b.kind === "gap" && a.start === b.start && a.end === b.end;
}
function sameModel(a: TimelineCanvasModel, b: TimelineCanvasModel) {
  return (
    a.rows === b.rows &&
    a.audioTracks === b.audioTracks &&
    a.assets === b.assets &&
    a.selectedLayerIds === b.selectedLayerIds &&
    a.selectedKeyIds === b.selectedKeyIds &&
    a.selectedAudioTrackIds === b.selectedAudioTrackIds &&
    a.scale === b.scale &&
    a.duration === b.duration &&
    a.rowHeight === b.rowHeight &&
    a.gutter === b.gutter &&
    a.draft === b.draft &&
    a.audioDraft === b.audioDraft &&
    a.selectionPreview === b.selectionPreview &&
    a.rowPositions === b.rowPositions &&
    sameHover(a.hoverHit, b.hoverHit) &&
    a.waveformPeaks === b.waveformPeaks
  );
}

/**
 * Architectural reference: Beam useTimelineSurface (MPL-2.0), independently implemented here.
 * The host retains native sticky placement; this resource owns one bounded, on-demand bitmap.
 */
export function createTimelineCanvasSurface(
  options: TimelineCanvasSurfaceOptions,
): TimelineCanvasSurface {
  const { canvas, frame, viewport } = options;
  const window = canvas.ownerDocument.defaultView;
  if (!window) throw new Error("Timeline canvas requires an attached browser document.");
  const queue = createTimelineCanvasFrameQueue({
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (id) => window.cancelAnimationFrame(id),
  });
  const waveformPaths = createTimelineWaveformPaths();
  const rowReader = createTimelineCanvasRowPositions(frame);
  let rowPositions: TimelineCanvasModel["rowPositions"] = null,
    trackingRows = false,
    animateRows = false;
  let model: TimelineCanvasModel | null = null,
    scene: TimelineCanvasScene | null = null,
    disposed = false,
    dirty = true,
    colors: TimelineCanvasPalette | null = null,
    paints = 0;
  let glyphOpacity = 1,
    glyphTarget = 1,
    glyphFrom = 1,
    fadeStart = 0,
    dragging = false;
  const reducedMotion =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  let size = { width: 0, height: 0 };
  const bodyTop = options.bodyTop ?? 32;
  canvas.dataset.timelineCanvas = "true";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.pointerEvents = "none";
  canvas.style.position = "absolute";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.transform = "translate3d(0,0,0)";
  const measure = () => {
    size = {
      width: Math.max(0, viewport.clientWidth - (model?.gutter ?? 244)),
      height: Math.max(0, viewport.clientHeight - bodyTop),
    };
  };
  const reorderActive = () =>
    canvas.ownerDocument.documentElement.dataset.layerReorderActive === "true";
  const measureRows = () => {
    if (disposed || !model || (!trackingRows && !reorderActive())) return;
    const measured = rowReader.read(viewport, model.rowHeight, size.height);
    rowPositions = measured.positions;
    animateRows = measured.animating;
    if (measured.changed) dirty = true;
    trackingRows = reorderActive() || measured.animating;
    if (!trackingRows) {
      rowReader.clear();
      rowPositions = null;
      dirty = true;
    }
  };
  const view = (): TimelineCanvasViewport => ({
    ...size,
    left: viewport.scrollLeft,
    top: viewport.scrollTop,
  });
  const prepare = () => {
    if (!model) return null;
    const current = view();
    if (
      !scene ||
      dirty ||
      current.left !== scene.viewport.left ||
      current.top !== scene.viewport.top ||
      current.width !== scene.viewport.width ||
      current.height !== scene.viewport.height
    ) {
      scene = projectTimelineCanvas(rowPositions ? { ...model, rowPositions } : model, current);
      dirty = false;
    }
    return scene;
  };
  const draw = () => {
    if (disposed || !model) return;
    try {
      const prepared = prepare();
      if (!prepared) return;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Timeline canvas context unavailable.");
      const allocation = timelineCanvasAllocation(size.width, size.height, window.devicePixelRatio);
      if (canvas.width !== allocation.width) canvas.width = allocation.width;
      if (canvas.height !== allocation.height) canvas.height = allocation.height;
      const width = `${size.width}px`,
        height = `${size.height}px`;
      canvas.style.width = frame.style.width = width;
      canvas.style.height = frame.style.height = height;
      context.setTransform(
        allocation.width / Math.max(1, size.width),
        0,
        0,
        allocation.height / Math.max(1, size.height),
        0,
        0,
      );
      colors ??= paletteFor(frame);
      if (glyphOpacity !== glyphTarget) {
        const progress = reducedMotion?.matches
          ? 1
          : Math.min(1, Math.max(0, (window.performance.now() - fadeStart) / 100));
        glyphOpacity =
          progress === 1 ? glyphTarget : glyphFrom + (glyphTarget - glyphFrom) * progress;
      }
      paintTimelineCanvas(context, prepared, colors, glyphOpacity, waveformPaths);
      Object.assign(canvas.dataset, {
        timelinePaints: String(++paints),
        timelineRows: String(prepared.rows.length),
        timelineItems: String(prepared.rows.reduce((count, row) => count + row.items.length, 0)),
        timelineWaveforms: String(
          prepared.rows.reduce(
            (count, row) =>
              count +
              row.items.reduce(
                (total, item) => total + Number(item.kind === "audio" && !!item.peaks?.length),
                0,
              ),
            0,
          ),
        ),
        timelineLeft: String(prepared.viewport.left),
        timelineTop: String(prepared.viewport.top),
        timelineWidth: String(size.width),
        timelineHeight: String(size.height),
        timelineDpr: String(allocation.ratio),
        timelineBytes: String(allocation.bytes),
        timelineFirstRow: String(
          prepared.rows.reduce(
            (first, row) => Math.min(first, row.index),
            prepared.rows[0]?.index ?? 0,
          ),
        ),
        timelineLastRow: String(
          prepared.rows.reduce((last, row) => Math.max(last, row.index + 1), 0),
        ),
        timelineSelectedKeys: String(model.selectedKeyIds.size),
        timelineHoverRow: prepared.hoverHit?.rowKey ?? "",
        timelineHoverKind: prepared.hoverHit?.kind ?? "",
        timelineHoverKey:
          prepared.hoverHit && "keyId" in prepared.hoverHit ? prepared.hoverHit.keyId : "",
        scale: String(model.scale),
        timelineGlyphOpacity: String(glyphOpacity),
        timelineRowPositions: rowPositions
          ? JSON.stringify(prepared.rows.map((row) => [row.key, row.y]))
          : "",
      });
      if (glyphOpacity !== glyphTarget) invalidate();
      if (animateRows) {
        queue.request("measure", measureRows);
        invalidate();
      }
    } catch (error) {
      if (options.onError) options.onError(error);
      else throw error;
    }
  };
  const invalidate = () => {
    if (!disposed) queue.request("paint", draw);
  };
  const scrolled = () => {
    if (trackingRows) queue.request("measure", measureRows);
    invalidate();
  };
  // The panel emits this after its layout effect applies the native zoom anchor.
  const presentZoom = () => {
    invalidate();
    queue.flush();
  };
  const resized = () => {
    if (disposed) return;
    queue.request("measure", measure);
    scrolled();
  };
  const theme = () => {
    colors = null;
    invalidate();
  };
  const reorderChanged = () => {
    if (disposed || (!trackingRows && !reorderActive())) return;
    trackingRows = true;
    queue.request("measure", measureRows);
    invalidate();
  };
  const motionChanged = () => {
    if (reducedMotion?.matches) {
      glyphOpacity = glyphTarget;
      invalidate();
    }
  };
  reducedMotion?.addEventListener("change", motionChanged);
  const resizeObserver = new ResizeObserver(resized);
  resizeObserver.observe(viewport);
  const themeObserver = new MutationObserver(theme);
  themeObserver.observe(canvas.ownerDocument.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });
  const reorderObserver = new MutationObserver(reorderChanged);
  reorderObserver.observe(canvas.ownerDocument.documentElement, {
    attributes: true,
    attributeFilter: ["data-layer-reorder-active"],
  });
  viewport.addEventListener("scroll", scrolled, { passive: true });
  viewport.addEventListener(TIMELINE_ZOOM_PRESENT, presentZoom);
  window.addEventListener("resize", resized);
  measure();
  return {
    update(next) {
      if (disposed || (model && sameModel(model, next))) return;
      const gutterChanged = model?.gutter !== next.gutter;
      model = next;
      dirty = true;
      if (reorderActive() || trackingRows) {
        trackingRows = true;
        queue.request("measure", measureRows);
      }
      const nextDragging =
        !!next.draft &&
        next.draft.delta.value !== 0 &&
        (next.draft.action === "keys" || next.draft.action === "move");
      if (nextDragging !== dragging) {
        dragging = nextDragging;
        glyphFrom = glyphOpacity;
        glyphTarget = dragging ? 0 : 1;
        fadeStart = window.performance.now();
        if (reducedMotion?.matches) glyphOpacity = glyphTarget;
      }
      if (gutterChanged) queue.request("measure", measure);
      invalidate();
    },
    invalidate,
    hitTest(x, y) {
      if (disposed) return null;
      const prepared = prepare();
      return prepared ? hitTestTimelineCanvas(prepared, x, y) : null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      queue.dispose();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      reorderObserver.disconnect();
      rowReader.dispose();
      waveformPaths.dispose();
      viewport.removeEventListener("scroll", scrolled);
      viewport.removeEventListener(TIMELINE_ZOOM_PRESENT, presentZoom);
      window.removeEventListener("resize", resized);
      reducedMotion?.removeEventListener("change", motionChanged);
      canvas.width = canvas.height = 1;
      model = null;
      scene = null;
      colors = null;
    },
  };
}

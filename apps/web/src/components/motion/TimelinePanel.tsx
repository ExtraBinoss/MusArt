import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  PanelBottom,
  PanelBottomClose,
  PanelBottomOpen,
  Pin,
  PinOff,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  compareMotionTime,
  motionTimeToSeconds,
  type EnginePort,
  type SessionSnapshot,
} from "@musart/core";
import { TimelineIconButton } from "./ControlButton";
import { TooltipProvider } from "../ui/tooltip";
import { TimelineZoom } from "./TimelineZoom";
import { AudioLibrary } from "./audio/AudioLibrary";
import { formatUiError } from "../../state/i18n/errors/format";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { useRenderMetrics } from "../../state/session/render-metrics";
import { TimelineControls } from "./TimelineControls";
import { useOccurrenceProjection } from "./occurrences/use-occurrence-projection";
import { TimelineVirtualRows } from "./TimelineVirtualRows";
import { TimelineRuler } from "./TimelineRuler";
import { useTimelineLayerDrag } from "./layer-drag/use-timeline-layer-drag";
import type { TimelineTransport, TimelineUnit } from "./model";
import { createTimelineGestures } from "./gestures";
import { clampTimelineHeight } from "./height";
import {
  useTimelineCollapsedRows,
  useTimelinePreferences,
  useTimelineRangeZoom,
} from "./preferences";
import "./messages";
import "./timeline.css";

const GUTTER = 244,
  ACTION_WIDTH = 112,
  ROW_HEIGHT = 24;

export function TimelinePanel({
  engine,
  snapshot,
  transport,
  onClose,
  onPin,
  pinned = false,
  expanded = true,
  active = true,
}: {
  engine: EnginePort;
  snapshot: SessionSnapshot;
  transport: TimelineTransport;
  onClose: () => void;
  onPin?: () => void;
  pinned?: boolean;
  expanded?: boolean;
  active?: boolean;
}) {
  const { t } = useTranslation("motion");
  const panel = useRef<HTMLElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    playhead = useRef<HTMLDivElement>(null);
  useRenderMetrics(panel);
  const playheadClip = useRef<HTMLDivElement>(null);
  const paintPlayhead = useRef<() => void>(() => {});
  const horizontalScroll = useRef(0);
  const publishedLeft = useRef(0);
  const feedback = useRef<HTMLOutputElement>(null);
  const [, refreshSelection] = useReducer((value: number) => value + 1, 0);
  const [interactionError, setInteractionError] = useState("");
  const [unit, setUnit] = useState<TimelineUnit>("ms");
  const {
    zoom,
    setZoom,
    height,
    setHeight,
    protectZoom,
    protectHeight,
    saveZoom,
    saveHeight,
    fitHeight,
  } = useTimelinePreferences(engine);
  const committedZoom = useRef(120),
    desiredZoom = useRef(120);
  const zoomAnchor = useRef<{ time: number; x: number } | null>(null);
  const { collapsed, setCollapsed, toggle: toggleRow } = useTimelineCollapsedRows();
  const [view, setView] = useState({ left: 0, width: 900 });
  const resize = useRef<{ pointer: number; y: number; height: number } | null>(null);
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const chosenOccurrences = useOccurrenceProjection(engine, page, transport);
  const actionWidth = ACTION_WIDTH + 32;
  const duration = page.motion ? motionTimeToSeconds(page.motion.duration) : 2;
  const width = Math.max(view.width, Math.min(1_000_000, duration * zoom + actionWidth + 64));
  const scale = zoom;
  const selectRow = useCallback(
    (id: string, additive: boolean) => {
      const current = engine.getSnapshot();
      if (current.pageId !== page.id || current.project.id !== snapshot.project.id) return;
      engine.select(
        additive
          ? current.selection.includes(id)
            ? current.selection.filter((item) => item !== id)
            : [...current.selection, id]
          : [id],
      );
    },
    [engine, page.id, snapshot.project.id],
  );
  const zoomRange = useTimelineRangeZoom({
    zoom,
    width: view.width,
    actionWidth,
    protectZoom,
    saveZoom,
    setZoom,
    viewport,
    horizontalScroll,
    desiredZoom,
    anchor: zoomAnchor,
  });
  useLayoutEffect(() => {
    committedZoom.current = scale;
    desiredZoom.current = scale;
    if (zoomAnchor.current && viewport.current) {
      horizontalScroll.current = Math.max(
        0,
        zoomAnchor.current.time * scale - zoomAnchor.current.x,
      );
      viewport.current.scrollLeft = horizontalScroll.current;
      zoomAnchor.current = null;
    }
  }, [scale]);
  useEffect(() => {
    const node = viewport.current;
    if (!node || !active) return;
    let frame: number | null = null;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      protectZoom();
      const x = Math.max(0, event.clientX - node.getBoundingClientRect().left - GUTTER);
      zoomAnchor.current = { time: (horizontalScroll.current + x) / committedZoom.current, x };
      const next = Math.max(
        20,
        Math.min(
          640,
          desiredZoom.current *
            Math.exp(
              -event.deltaY *
                (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1) *
                0.006,
            ),
        ),
      );
      desiredZoom.current = next;
      if (frame === null)
        frame = requestAnimationFrame(() => {
          frame = null;
          setZoom(desiredZoom.current);
          saveZoom(desiredZoom.current, 600);
        });
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", wheel);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [active, protectZoom, saveZoom, setZoom]);
  const gestures = useMemo(
    () =>
      createTimelineGestures({
        engine,
        transport,
        compositionId: page.id,
        onSelection: refreshSelection,
        onError: setInteractionError,
        onStart: () => setInteractionError(""),
      }),
    [engine, transport, page.id],
  );
  useLayoutEffect(() => {
    if (active && panel.current && viewport.current && feedback.current)
      gestures.connect({
        root: panel.current,
        viewport: viewport.current,
        feedback: feedback.current,
        scale,
        gutter: GUTTER,
        timeWidth: view.width,
      });
    else gestures.dispose();
  }, [gestures, scale, active, view.width]);
  useLayoutEffect(() => {
    if (active) return;
    const origin = resize.current;
    resize.current = null;
    if (!origin || !panel.current) return;
    panel.current.style.height = `${origin.height}px`;
    const separator = panel.current.querySelector<HTMLElement>(".motion-resize");
    if (separator) {
      delete separator.dataset.separator;
      if (separator.hasPointerCapture(origin.pointer))
        separator.releasePointerCapture(origin.pointer);
    }
  }, [active]);
  useLayoutEffect(() => {
    gestures.updateOrigin(snapshot.project.id, snapshot.revision);
  }, [gestures, snapshot.project.id, snapshot.revision]);
  useEffect(() => () => gestures.dispose(), [gestures]);
  useEffect(() => {
    const fit = () => {
      const active = resize.current;
      resize.current = null;
      const separator = panel.current?.querySelector<HTMLElement>(".motion-resize");
      if (active && separator?.hasPointerCapture(active.pointer))
        separator.releasePointerCapture(active.pointer);
      if (separator) delete separator.dataset.separator;
      fitHeight();
    };
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fitHeight]);
  const layerDrag = useTimelineLayerDrag({
    engine,
    page,
    chosenOccurrences,
    collapsed,
    transport,
    gestures,
    active,
    onError: setInteractionError,
  });
  const rows = layerDrag.rows;
  const selected = useMemo(() => new Set(snapshot.selection), [snapshot.selection]);
  const audioTracks = page.motion?.audioTracks ?? [];
  const audioError = useCallback((error: unknown) => setInteractionError(formatUiError(error)), []);
  const toggleUnit = useCallback(() => setUnit((value) => (value === "s" ? "ms" : "s")), []);
  // Vertical window changes do not rebuild the transport's Radix controls or ruler.
  const collapseControl = useMemo(
    () => (
      <TimelineIconButton
        disabled={!active}
        label={t(collapsed.size ? "expandAll" : "collapseAll")}
        onClick={() =>
          setCollapsed(collapsed.size ? new Set() : new Set(page.layers.map((layer) => layer.id)))
        }
      >
        {collapsed.size ? <ChevronsUpDown size={13} /> : <ChevronsDownUp size={13} />}
      </TimelineIconButton>
    ),
    [active, collapsed, page.layers, t, setCollapsed],
  );
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => {
      const measuredWidth = Math.max(1, (node.clientWidth || 900) - GUTTER);
      setView((current) =>
        current.width === measuredWidth ? current : { ...current, width: measuredWidth },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    let previous: number | null = null;
    const paint = () => {
      const state = transport.read();
      const node = viewport.current;
      if (playhead.current && playheadClip.current && node) {
        const x = motionTimeToSeconds(state.time) * scale;
        const left = horizontalScroll.current;
        const visibleWidth = Math.max(0, view.width);
        playheadClip.current.style.left = `${GUTTER + left}px`;
        playheadClip.current.style.width = `${visibleWidth}px`;
        playhead.current.style.transform = `translateX(${x - left}px)`;
        playhead.current.dataset.atEnd = String(
          compareMotionTime(state.time, state.duration) === 0,
        );
        playhead.current.style.visibility =
          state.compositionId !== page.id || x < left || x > left + visibleWidth
            ? "hidden"
            : "visible";
      }
    };
    const sync = () => {
      const state = transport.read(),
        node = viewport.current;
      const x = motionTimeToSeconds(state.time) * scale;
      if (active && state.playing && state.compositionId === page.id && node) {
        const visibleWidth = Math.max(1, view.width - actionWidth);
        const padding = Math.min(48, visibleWidth / 4);
        const reset =
          previous !== null && state.playbackMode === "loop" && previous - x > visibleWidth / 2;
        let left = horizontalScroll.current;
        if (reset) left = 0;
        else if (x > left + visibleWidth - padding) left = x - visibleWidth + padding;
        else if (x < left + padding) left = Math.max(0, x - padding);
        const next = Math.max(0, Math.min(Math.max(0, width - view.width), left));
        if (horizontalScroll.current !== next) {
          horizontalScroll.current = next;
          node.scrollLeft = next;
        }
      }
      previous = x;
      paint();
    };
    paintPlayhead.current = paint;
    sync();
    const unsubscribe = transport.subscribe(sync);
    return () => {
      unsubscribe();
      paintPlayhead.current = () => {};
    };
  }, [transport, scale, page.id, view.width, width, active, actionWidth]);
  function size(value: number) {
    return clampTimelineHeight(value, window.innerHeight);
  }
  function resizeMove(event: PointerEvent<HTMLDivElement>) {
    const origin = resize.current;
    if (!origin || origin.pointer !== event.pointerId || !panel.current) return;
    panel.current.style.height = `${size(origin.height + origin.y - event.clientY)}px`;
  }
  function finishResize(event: PointerEvent<HTMLDivElement>, cancel: boolean) {
    if (resize.current?.pointer !== event.pointerId) return;
    const value = cancel
      ? resize.current.height
      : parseFloat(panel.current?.style.height ?? String(height));
    resize.current = null;
    delete event.currentTarget.dataset.separator;
    if (!cancel) saveHeight(value);
    setHeight(value);
    if (panel.current) panel.current.style.height = `${value}px`;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <TooltipProvider delayDuration={250}>
      <section
        ref={panel}
        className="motion-timeline"
        style={{ height }}
        aria-label={t("timeline")}
        data-canvas-control
        data-keybinding-capture
        data-document-shortcuts
        onKeyDown={(event) => {
          if (!event.currentTarget.contains(event.target as Node)) return;
          gestures.keyDown(event);
          if (
            event.defaultPrevented ||
            event.key !== " " ||
            event.repeat ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey
          )
            return;
          const target = event.target as HTMLElement;
          if (
            target.closest(
              "input,textarea,[contenteditable=true],[role=combobox],[role=radio],[data-slot=popover-content]",
            )
          )
            return;
          if (
            target.closest("button") &&
            !target.closest(".motion-key,.motion-track,.motion-trim-handle,.motion-row-name")
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          if (transport.read().playing) transport.pause();
          else transport.play();
        }}
      >
        <div
          className="motion-resize panel-divider"
          role="separator"
          tabIndex={0}
          aria-label={t("resize")}
          aria-orientation="horizontal"
          aria-valuenow={height}
          aria-valuemin={164}
          aria-valuemax={Math.max(164, window.innerHeight * 0.65)}
          onPointerDown={(event) => {
            if (!active || event.button !== 0) return;
            event.preventDefault();
            protectHeight();
            event.currentTarget.setPointerCapture(event.pointerId);
            resize.current = { pointer: event.pointerId, y: event.clientY, height };
            event.currentTarget.dataset.separator = "active";
          }}
          onPointerMove={resizeMove}
          onPointerUp={(event) => finishResize(event, false)}
          onPointerCancel={(event) => finishResize(event, true)}
          onLostPointerCapture={(event) => {
            delete event.currentTarget.dataset.separator;
            if (resize.current && panel.current)
              panel.current.style.height = `${resize.current.height}px`;
            resize.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && resize.current) {
              const origin = resize.current;
              resize.current = null;
              if (panel.current) panel.current.style.height = `${origin.height}px`;
              setHeight(origin.height);
              if (event.currentTarget.hasPointerCapture(origin.pointer))
                event.currentTarget.releasePointerCapture(origin.pointer);
              event.preventDefault();
              return;
            }
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            const next = size(height + (event.key === "ArrowUp" ? 20 : -20));
            saveHeight(next);
            setHeight(next);
          }}
        >
          <span className="panel-divider-grip" aria-hidden />
        </div>
        <ScrollShadow className="motion-scroll-shadow">
          <div
            className="motion-timeline-scroll"
            ref={viewport}
            data-layer-drag-viewport
            data-layer-drag-top-inset="32"
            onDragOver={(event) => layerDrag.native.overTree(event)}
            onDrop={(event) => layerDrag.native.drop(event)}
            onScroll={(event) => {
              const node = event.currentTarget;
              horizontalScroll.current = node.scrollLeft;
              paintPlayhead.current();
              const left = Math.floor(horizontalScroll.current / 120) * 120;
              if (left !== publishedLeft.current) {
                publishedLeft.current = left;
                setView((value) => ({ ...value, left }));
              }
            }}
          >
            <div
              className="motion-timeline-content"
              style={{ width: GUTTER + width, minHeight: "100%" }}
            >
              <div className="motion-ruler-line">
                <div className="motion-ruler-label">
                  <TimelineControls
                    engine={engine}
                    snapshot={snapshot}
                    transport={transport}
                    active={active}
                    unit={unit}
                    onUnit={toggleUnit}
                    collapseControl={collapseControl}
                  />
                </div>
                <TimelineRuler
                  transport={transport}
                  active={active}
                  duration={duration}
                  displayDuration={width / scale}
                  pixelsPerSecond={scale}
                  left={Math.max(0, view.left - 120)}
                  width={Math.max(0, view.width + 240 - actionWidth)}
                  unit={unit}
                />
                <div className="motion-timeline-actions" data-has-pin={Boolean(onPin)}>
                  <AudioLibrary engine={engine} disabled={!active} onError={audioError} />
                  <TimelineZoom
                    value={zoom}
                    disabled={!active}
                    onPreview={(value) => {
                      protectZoom();
                      zoomAnchor.current = null;
                      desiredZoom.current = value;
                      setZoom(value);
                    }}
                    onCommit={saveZoom}
                  />
                  {onPin && (
                    <TimelineIconButton
                      label={t(pinned ? "unpin" : "pin")}
                      onClick={onPin}
                      aria-pressed={pinned}
                    >
                      {pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </TimelineIconButton>
                  )}
                  {!onPin && (
                    <TimelineIconButton
                      label={t(expanded ? "close" : "open")}
                      onClick={onClose}
                      aria-expanded={expanded}
                    >
                      {expanded ? <PanelBottomClose size={14} /> : <PanelBottomOpen size={14} />}
                    </TimelineIconButton>
                  )}
                </div>
              </div>
              <TimelineVirtualRows
                viewport={viewport}
                audioTracks={audioTracks}
                assets={snapshot.project.assets}
                onAudioError={audioError}
                rows={rows}
                onError={setInteractionError}
                drag={layerDrag}
                gestures={gestures}
                interactive={active}
                engine={engine}
                compositionId={page.id}
                rowHeight={ROW_HEIGHT}
                selected={selected}
                pixelsPerSecond={scale}
                duration={duration}
                left={Math.max(0, view.left - 120)}
                width={view.width + 240}
                unit={unit}
                transport={transport}
                onToggle={toggleRow}
                onSelect={selectRow}
                onZoomRange={zoomRange}
              />
              <div ref={playheadClip} className="motion-playhead-clip" aria-hidden>
                <div ref={playhead} className="motion-playhead" />
              </div>
            </div>
            {!rows.length && !audioTracks.length && (
              <div className="motion-empty">
                <PanelBottom size={22} />
                <p>{t("empty")}</p>
                <span>{t("emptyHint")}</span>
              </div>
            )}
          </div>
        </ScrollShadow>
        <output ref={feedback} className="motion-gesture-feedback" aria-live="off" />
        {interactionError && (
          <p className="motion-gesture-error" role="alert">
            {t(interactionError, { defaultValue: interactionError })}
          </p>
        )}
      </section>
    </TooltipProvider>
  );
}

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
import { ChevronsDownUp, ChevronsUpDown, PanelBottom, PanelBottomClose } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  compareMotionTime,
  motionTimeToSeconds,
  type EnginePort,
  type SessionSnapshot,
} from "@musart/core";
import { TimelineIconButton } from "./ControlButton";
import { Slider } from "../ui/slider";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useVirtualList } from "../shared/scroll/use-virtual-list";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { useRenderMetrics } from "../../state/session/render-metrics";
import { TimelineControls } from "./TimelineControls";
import { TimelineRows } from "./TimelineRows";
import { TimelineRuler } from "./TimelineRuler";
import { projectTimelineRows } from "./tree";
import type { TimelineTransport, TimelineUnit } from "./model";
import { createTimelineGestures } from "./gestures";
import { clampTimelineHeight, readTimelineHeight, rememberTimelineHeight } from "./height";
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
  active = true,
}: {
  engine: EnginePort;
  snapshot: SessionSnapshot;
  transport: TimelineTransport;
  onClose: () => void;
  active?: boolean;
}) {
  const { t } = useTranslation("motion");
  const panel = useRef<HTMLElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    playhead = useRef<HTMLDivElement>(null);
  useRenderMetrics(panel);
  const playheadClip = useRef<HTMLDivElement>(null);
  const paintPlayhead = useRef<() => void>(() => {});
  const verticalRow = useRef(0);
  const horizontalScroll = useRef(0);
  const feedback = useRef<HTMLOutputElement>(null);
  const [, refreshSelection] = useReducer((value: number) => value + 1, 0);
  const [interactionError, setInteractionError] = useState("");
  const [unit, setUnit] = useState<TimelineUnit>("ms");
  const [zoom, setZoom] = useState(120);
  const committedZoom = useRef(120),
    desiredZoom = useRef(120);
  const zoomAnchor = useRef<{ time: number; x: number } | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [view, setView] = useState({ left: 0, width: 900 });
  const [height, setHeight] = useState(() => readTimelineHeight(engine, window.innerHeight));
  const resize = useRef<{ pointer: number; y: number; height: number } | null>(null);
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const duration = page.motion ? motionTimeToSeconds(page.motion.duration) : 2;
  const width = Math.max(view.width, Math.min(1_000_000, duration * zoom + ACTION_WIDTH + 64));
  const scale = zoom;
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
        });
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", wheel);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [active]);
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
      });
    else gestures.dispose();
  }, [gestures, scale, active]);
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
      setHeight(readTimelineHeight(engine, window.innerHeight));
    };
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [engine]);
  const rows = useMemo(() => projectTimelineRows(page, collapsed), [page, collapsed]);
  const selected = useMemo(() => new Set(snapshot.selection), [snapshot.selection]);
  const virtual = useVirtualList(rows.length, ROW_HEIGHT, viewport, 5);
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
    [active, collapsed, page.layers, t],
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
        const visibleWidth = Math.max(1, view.width - ACTION_WIDTH);
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
  }, [transport, scale, page.id, view.width, width, active]);
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
    if (!cancel) rememberTimelineHeight(engine, value, window.innerHeight);
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
        onKeyDown={(event) => {
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
            rememberTimelineHeight(engine, next, window.innerHeight);
            setHeight(next);
          }}
        >
          <span className="panel-divider-grip" aria-hidden />
        </div>
        <ScrollShadow className="motion-scroll-shadow">
          <div
            className="motion-timeline-scroll"
            ref={viewport}
            onScroll={(event) => {
              const node = event.currentTarget;
              const row = Math.floor(node.scrollTop / ROW_HEIGHT);
              if (row !== verticalRow.current) {
                verticalRow.current = row;
                virtual.onScroll(event);
              }
              horizontalScroll.current = node.scrollLeft;
              paintPlayhead.current();
              const left = Math.floor(horizontalScroll.current / 120) * 120;
              setView((value) => (value.left === left ? value : { ...value, left }));
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
                  width={Math.max(0, view.width + 240 - ACTION_WIDTH)}
                  unit={unit}
                />
                <div className="motion-timeline-actions">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Slider
                        className="motion-zoom"
                        tone="neutral"
                        disabled={!active}
                        min={20}
                        max={640}
                        step={10}
                        value={[zoom]}
                        aria-label={t("zoom")}
                        onValueChange={(values) => {
                          zoomAnchor.current = null;
                          desiredZoom.current = values[0] ?? 120;
                          setZoom(values[0] ?? 120);
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="motion-control-tooltip">
                      <span>{t("zoom")}</span>
                      <KbdGroup>
                        <Kbd>Ctrl / ⌘</Kbd>
                        <Kbd>{t("wheel")}</Kbd>
                      </KbdGroup>
                    </TooltipContent>
                  </Tooltip>
                  <TimelineIconButton label={t("close")} onClick={onClose}>
                    <PanelBottomClose size={14} />
                  </TimelineIconButton>
                </div>
              </div>
              <div
                className="motion-row-space"
                style={{ height: Math.max(virtual.height, 140) }}
                tabIndex={0}
                role="group"
                aria-label={t("selectKeysArea")}
                onPointerDown={(event) => {
                  if (active) gestures.beginMarquee(event, rows, ROW_HEIGHT);
                }}
              >
                <TimelineRows
                  rows={rows}
                  gestures={gestures}
                  interactive={active}
                  engine={engine}
                  compositionId={page.id}
                  first={virtual.first}
                  last={virtual.last}
                  rowHeight={ROW_HEIGHT}
                  selected={selected}
                  pixelsPerSecond={scale}
                  duration={duration}
                  left={Math.max(0, view.left - 120)}
                  width={view.width + 240}
                  unit={unit}
                  transport={transport}
                  onToggle={(id) =>
                    setCollapsed((current) => {
                      const next = new Set(current);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  onSelect={(id, additive) =>
                    engine.select(
                      additive
                        ? selected.has(id)
                          ? snapshot.selection.filter((item) => item !== id)
                          : [...snapshot.selection, id]
                        : [id],
                    )
                  }
                  onZoomRange={(start, end) => {
                    const next = Math.min(
                      640,
                      Math.max(
                        zoom * 2,
                        (view.width - ACTION_WIDTH - 48) / Math.max(0.001, end - start),
                      ),
                    );
                    if (next === scale && viewport.current) {
                      horizontalScroll.current = Math.max(0, start * next - 24);
                      viewport.current.scrollLeft = horizontalScroll.current;
                    } else {
                      zoomAnchor.current = { time: start, x: 24 };
                      desiredZoom.current = next;
                      setZoom(next);
                    }
                  }}
                />
              </div>
              <div ref={playheadClip} className="motion-playhead-clip" aria-hidden>
                <div ref={playhead} className="motion-playhead" />
              </div>
            </div>
            {!rows.length && (
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
            {t(interactionError)}
          </p>
        )}
      </section>
    </TooltipProvider>
  );
}

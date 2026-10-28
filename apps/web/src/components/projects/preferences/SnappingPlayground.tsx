import { useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { SnapIndex, createLayer, createPage, type Point, type Bounds } from "@musart/core";
import { Play, RotateCcw, X } from "lucide-react";
import { snappingPreferences } from "../../../state/snapping/preferences";
import { Button } from "../../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import "./messages";
import "./snapping-playground.css";

const START = Object.freeze({ x: 52, y: 16, width: 52, height: 48 });
const SIZE = Object.freeze({ width: 360, height: 180 });
const REFERENCE = Object.freeze({ x: 232, y: 56, width: 64, height: 68 });

/** A disposable sandbox, using the same pure resolver and screen-pixel preference as gestures. */
export function SnappingPlayground() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <section className="snapping-playground">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Play size={13} />
            {t("preferences:trySnap")}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={12}
          className="snapping-popover"
          onEscapeKeyDown={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest('[data-snap-dragging="true"]')
            )
              event.preventDefault();
          }}
          aria-label={t("preferences:tryCanvas")}
          data-testid="snapping-preview-popover"
        >
          <header>
            <strong>{t("preferences:trySnap")}</strong>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("preferences:tryClose")}
              onClick={() => setOpen(false)}
            >
              <X size={13} />
            </Button>
          </header>
          <ScrollShadow className="snapping-preview-scroll" surface="var(--popover)">
            <Playground />
          </ScrollShadow>
        </PopoverContent>
      </Popover>
    </section>
  );
}

function Playground() {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null),
    moving = useRef<SVGGElement>(null);
  const raw = useRef<Bounds>({ ...START });
  const drag = useRef<{ id: number; start: Point; origin: Bounds } | null>(null);
  const index = useMemo(
    () =>
      new SnapIndex(
        createPage({
          id: "snap-sandbox",
          ...SIZE,
          layers: [
            createLayer("rectangle", { id: "reference", ...REFERENCE }),
            createLayer("rectangle", { id: "moving", ...START }),
          ],
        }),
        ["moving"],
      ),
    [],
  );

  const paint = useCallback(
    (bypass = false) => {
      const element = host.current;
      if (!element) return;
      const preference = snappingPreferences.read(),
        zoom = (element.querySelector("svg")?.getBoundingClientRect().width ?? 0) / SIZE.width;
      const enabled = preference.enabled && !bypass && zoom > 0;
      const result = enabled ? index.snap(raw.current, preference.threshold / zoom) : null;
      const bounds = result?.bounds ?? raw.current;
      moving.current?.setAttribute("transform", `translate(${bounds.x} ${bounds.y})`);
      element.dataset.snapped = String(Boolean(result?.cues.length));
      element.dataset.x = String(bounds.x);
      element.dataset.y = String(bounds.y);
      for (const line of element.querySelectorAll<SVGLineElement>("[data-snap-axis]")) {
        const cue = result?.cues.find((item) => item.axis === line.dataset.snapAxis);
        line.style.visibility = cue ? "visible" : "hidden";
        if (cue)
          for (const [key, value] of Object.entries({
            x1: cue.from.x,
            y1: cue.from.y,
            x2: cue.to.x,
            y2: cue.to.y,
          }))
            line.setAttribute(key, String(value));
      }
    },
    [index],
  );
  const stop = useCallback(
    (cancel = false) => {
      const gesture = drag.current;
      if (!gesture) return;
      drag.current = null;
      if (host.current) host.current.dataset.snapDragging = "false";
      if (cancel) {
        raw.current = gesture.origin;
        paint();
      }
      if (host.current?.hasPointerCapture(gesture.id))
        host.current.releasePointerCapture(gesture.id);
    },
    [paint],
  );
  useLayoutEffect(() => {
    const resize = new ResizeObserver(() => paint());
    if (host.current) resize.observe(host.current);
    const unsubscribe = snappingPreferences.subscribe(() => paint());
    paint();
    return () => {
      stop();
      resize.disconnect();
      unsubscribe();
    };
  }, [paint, stop]);
  const keyboard = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      stop(true);
      return;
    }
    const directions: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const delta = directions[event.key];
    if (!delta) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    raw.current = {
      ...raw.current,
      x: Math.max(0, Math.min(SIZE.width - START.width, raw.current.x + delta.x * step)),
      y: Math.max(0, Math.min(SIZE.height - START.height, raw.current.y + delta.y * step)),
    };
    paint(event.altKey);
  };
  return (
    <div className="snapping-sandbox">
      <p>{t("preferences:tryDescription")}</p>
      <div
        ref={host}
        className="snapping-stage"
        data-testid="snapping-playground"
        onPointerDown={(event) => {
          if (event.button !== 0 || !(event.target as Element).closest("[data-snap-drag]")) return;
          event.preventDefault();
          stop();
          drag.current = {
            id: event.pointerId,
            start: { x: event.clientX, y: event.clientY },
            origin: { ...raw.current },
          };
          event.currentTarget.dataset.snapDragging = "true";
          event.currentTarget.setPointerCapture(event.pointerId);
          moving.current?.focus();
        }}
        onPointerMove={(event) => {
          const gesture = drag.current,
            width = event.currentTarget.querySelector("svg")!.getBoundingClientRect().width;
          if (!gesture || event.pointerId !== gesture.id || !width) return;
          const zoom = width / SIZE.width;
          raw.current = {
            ...gesture.origin,
            x: Math.max(
              0,
              Math.min(
                SIZE.width - START.width,
                gesture.origin.x + (event.clientX - gesture.start.x) / zoom,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                SIZE.height - START.height,
                gesture.origin.y + (event.clientY - gesture.start.y) / zoom,
              ),
            ),
          };
          paint(event.altKey);
        }}
        onPointerUp={(event) => {
          if (event.pointerId === drag.current?.id) stop();
        }}
        onPointerCancel={() => stop(true)}
        onLostPointerCapture={() => stop(true)}
      >
        <svg viewBox={`0 0 ${SIZE.width} ${SIZE.height}`} aria-label={t("preferences:tryCanvas")}>
          <rect {...REFERENCE} rx="7" className="snapping-reference" />
          <g
            ref={moving}
            data-snap-drag
            role="button"
            tabIndex={0}
            aria-label={t("preferences:tryObject")}
            onKeyDown={keyboard}
          >
            <rect width={START.width} height={START.height} rx="7" className="snapping-moving" />
            <path d="M20 24h12m-6-6v12m-6-6 3-3m-3 3 3 3m9-3-3-3m3 3-3 3" />
          </g>
          <line data-snap-axis="x" />
          <line data-snap-axis="y" />
        </svg>
      </div>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          stop();
          raw.current = { ...START };
          paint();
        }}
      >
        <RotateCcw size={12} />
        {t("preferences:tryReset")}
      </Button>
    </div>
  );
}

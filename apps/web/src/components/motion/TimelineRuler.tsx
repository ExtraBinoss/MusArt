import { memo, useCallback, useLayoutEffect, useRef, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  addMotionTime,
  subtractMotionTime,
  compareMotionTime,
  frameTime,
  motionTimeToSeconds,
  type MotionTime,
} from "@musart/core";
import type { TimelineTransport, TimelineUnit } from "./model";
import { formatTimelineTime, timelineTicks, timelineTime } from "./time";
import "./messages";
import { FlagTriangleRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export const TimelineRuler = memo(function TimelineRuler({
  transport,
  duration,
  displayDuration = duration,
  pixelsPerSecond,
  left,
  width,
  unit,
  active = true,
}: {
  transport: TimelineTransport;
  duration: number;
  displayDuration?: number;
  pixelsPerSecond: number;
  left: number;
  width: number;
  unit: TimelineUnit;
  active?: boolean;
}) {
  const { t } = useTranslation("motion");
  const ruler = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const endMarker = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ pointer: number; origin: MotionTime } | null>(null);
  const cancel = useCallback(
    (node: HTMLDivElement) => {
      const pointerGesture = gesture.current;
      if (!pointerGesture) return;
      gesture.current = null;
      delete node.dataset.scrubbing;
      transport.seek(pointerGesture.origin);
      if (node.hasPointerCapture(pointerGesture.pointer))
        node.releasePointerCapture(pointerGesture.pointer);
    },
    [transport],
  );
  useLayoutEffect(() => {
    const sync = () => {
      const state = transport.read();
      ruler.current?.setAttribute("aria-valuenow", String(motionTimeToSeconds(state.time)));
      ruler.current?.setAttribute(
        "aria-valuetext",
        `${formatTimelineTime(state.time, unit)} ${unit}`,
      );
      if (playhead.current)
        playhead.current.style.transform = `translateX(${motionTimeToSeconds(state.time) * pixelsPerSecond}px)`;
      const atEnd = compareMotionTime(state.time, state.duration) === 0;
      if (playhead.current) playhead.current.dataset.atEnd = String(atEnd);
      if (endMarker.current) endMarker.current.dataset.atEnd = String(atEnd);
    };
    sync();
    const unsubscribe = transport.subscribe(sync);
    const node = ruler.current;
    return () => {
      unsubscribe();
      if (node) cancel(node);
    };
  }, [transport, unit, pixelsPerSecond, active, cancel]);
  function seek(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const seconds = Math.max(0, (event.clientX - bounds.left) / pixelsPerSecond);
    const end = transport.read().duration;
    // Preserve exact rational endpoints, including durations below the UI's microsecond grid.
    transport.seek(seconds >= motionTimeToSeconds(end) ? end : timelineTime(seconds));
  }
  return (
    <div
      ref={ruler}
      className="motion-ruler"
      role="slider"
      tabIndex={0}
      aria-label={t("seek")}
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={motionTimeToSeconds(transport.read().time)}
      onPointerDown={(event) => {
        if (!active || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        gesture.current = { pointer: event.pointerId, origin: transport.read().time };
        event.currentTarget.dataset.scrubbing = "true";
        event.currentTarget.dataset.pointerFocus = "true";
        event.currentTarget.setPointerCapture(event.pointerId);
        transport.pause();
        seek(event);
      }}
      onPointerMove={(event) => {
        if (gesture.current && gesture.current.pointer === event.pointerId) seek(event);
      }}
      onPointerUp={(event) => {
        if (gesture.current?.pointer !== event.pointerId) return;
        gesture.current = null;
        delete event.currentTarget.dataset.scrubbing;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => cancel(event.currentTarget)}
      onLostPointerCapture={(event) => cancel(event.currentTarget)}
      onBlur={(event) => {
        delete event.currentTarget.dataset.pointerFocus;
      }}
      onKeyDown={(event) => {
        if (!active) return;
        if (
          ["Home", "End", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab"].includes(
            event.key,
          )
        )
          delete event.currentTarget.dataset.pointerFocus;
        const state = transport.read(),
          frame = frameTime(1, state.frameRate);
        if (event.key === "Escape" && gesture.current) {
          event.preventDefault();
          event.stopPropagation();
          cancel(event.currentTarget);
          return;
        }
        const zero = { value: 0, rate: 1 };
        const next =
          event.key === "Home"
            ? zero
            : event.key === "End"
              ? state.duration
              : event.key === "ArrowLeft"
                ? subtractMotionTime(state.time, frame)
                : event.key === "ArrowRight"
                  ? addMotionTime(state.time, frame)
                  : null;
        if (next === null) return;
        event.preventDefault();
        event.stopPropagation();
        transport.pause();
        transport.seek(
          compareMotionTime(next, zero) < 0
            ? zero
            : compareMotionTime(next, state.duration) > 0
              ? state.duration
              : next,
        );
      }}
    >
      {timelineTicks(left, width, pixelsPerSecond)
        .filter(
          (tick) =>
            tick.time <= displayDuration &&
            tick.x + formatTimelineTime(timelineTime(tick.time), unit).length * 6 + 8 <=
              left + width,
        )
        .map((tick) => (
          <span
            key={tick.x}
            className={tick.time > duration ? "is-after-end" : undefined}
            style={{ left: tick.x }}
            aria-hidden
          >
            {formatTimelineTime(timelineTime(tick.time), unit)}
          </span>
        ))}
      <div className="motion-ruler-playhead" ref={playhead} aria-hidden />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={endMarker}
            type="button"
            className="motion-end-marker"
            aria-label={t("compositionEnd")}
            style={{ left: duration * pixelsPerSecond }}
            disabled={!active}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              transport.pause();
              transport.seek(transport.read().duration);
            }}
          >
            <FlagTriangleRight size={11} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{t("compositionEnd")}</TooltipContent>
      </Tooltip>
    </div>
  );
});

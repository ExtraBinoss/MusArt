import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { compareMotionTime, motionTimeToSeconds } from "@musart/core";
import { Input } from "../ui/input";
import { formatTimelineTime, parseTimelineTime } from "./time";
import type { TimelineTransport, TimelineUnit } from "./model";
import "./counter.css";

export function CurrentTime({
  transport,
  unit,
  active,
}: {
  transport: TimelineTransport;
  unit: TimelineUnit;
  active: boolean;
}) {
  const { t } = useTranslation("motion");
  const input = useRef<HTMLInputElement>(null);
  const display = useRef<HTMLSpanElement>(null);
  const cancelled = useRef(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const node = input.current;
    if (!node) return;
    const sync = () => {
      const editing = transport.readEditingTime?.();
      node.setAttribute("aria-label", t(editing ? "keyTime" : "currentTime"));
      const formatted = formatTimelineTime(editing ?? transport.read().time, unit);
      if (editing || document.activeElement !== node) node.value = formatted;
      if (display.current)
        display.current.textContent =
          unit === "ms" ? String(Math.round(Number(formatted))) : Number(formatted).toFixed(3);
    };
    sync();
    const stop = transport.subscribe(sync);
    return () => {
      stop();
    };
  }, [transport, unit, t]);
  function commit() {
    const field = input.current;
    if (!field) return;
    if (!active) {
      field.value = formatTimelineTime(transport.read().time, unit);
      return;
    }
    if (cancelled.current) {
      cancelled.current = false;
      setError(false);
      return;
    }
    const time = parseTimelineTime(field.value, unit),
      state = transport.read();
    if (!time || compareMotionTime(time, state.duration) > 0) {
      setError(true);
      field.value = formatTimelineTime(state.time, unit);
      return;
    }
    transport.pause();
    transport.seek(time);
    setError(false);
  }
  return (
    <div
      className="motion-time-field motion-time-counter"
      style={
        {
          "--counter-width": `${Math.max(5, Math.ceil(motionTimeToSeconds(transport.read().duration) * (unit === "ms" ? 1000 : 1)).toFixed(unit === "ms" ? 0 : 3).length)}ch`,
        } as CSSProperties
      }
    >
      <Input
        ref={input}
        type="number"
        step="any"
        min={0}
        defaultValue={formatTimelineTime(transport.read().time, unit)}
        aria-label={t("currentTime")}
        aria-invalid={error}
        disabled={!active}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancelled.current = true;
            event.currentTarget.value = formatTimelineTime(transport.read().time, unit);
            event.currentTarget.blur();
          }
        }}
      />
      <span ref={display} className="motion-time-counter-display" aria-hidden="true" />
      {error && (
        <span className="motion-field-error" role="alert">
          {t("invalidTime")}
        </span>
      )}
    </div>
  );
}

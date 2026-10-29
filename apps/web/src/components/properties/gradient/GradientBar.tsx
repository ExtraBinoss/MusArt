import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { FillGradient } from "@musart/core";
import { gradientRamp, replaceStop, stopBounds } from "./paint";
import styles from "./GradientControl.module.css";

interface Props {
  gradient: FillGradient;
  identity: string;
  selected: number;
  disabled?: boolean;
  invalidation?: { subscribe(listener: () => void): () => void };
  onSelect: (index: number) => void;
  onPreview: (gradient: FillGradient) => void;
  onCommit: (gradient: FillGradient) => void;
  onCancel: () => void;
}
interface Gesture {
  index: number;
  next: FillGradient;
  button: HTMLButtonElement;
  pointerId?: number;
  left: number;
  width: number;
}

/** Stop movement writes the ramp/fields imperatively and commits one engine command. */
export function GradientBar(props: Props) {
  const { gradient, identity, selected, disabled, onSelect } = props;
  const { t } = useTranslation("gradient");
  const ramp = useRef<HTMLDivElement>(null);
  const active = useRef<Gesture | null>(null);
  const callbacks = useRef(props);
  const blockedKey = useRef(false);
  useLayoutEffect(() => {
    callbacks.current = props;
  });
  const finish = useCallback(
    (cancel: boolean) => {
      const gesture = active.current;
      if (!gesture) return;
      active.current = null;
      gesture.button.removeAttribute("data-dragging");
      if (gesture.pointerId !== undefined && gesture.button.hasPointerCapture(gesture.pointerId))
        gesture.button.releasePointerCapture(gesture.pointerId);
      if (
        cancel ||
        gesture.next.stops[gesture.index]!.offset === gradient.stops[gesture.index]!.offset
      )
        callbacks.current.onCancel();
      else callbacks.current.onCommit(gesture.next);
    },
    [gradient],
  );
  useLayoutEffect(() => {
    const cancel = () => {
      if (active.current?.pointerId === undefined && active.current) blockedKey.current = true;
      finish(true);
    };
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      cancel();
    };
  }, [finish, identity, disabled]);
  useLayoutEffect(
    () =>
      props.invalidation?.subscribe(() => {
        if (active.current) blockedKey.current = true;
        finish(true);
      }),
    [props.invalidation, finish],
  );
  function preview(index: number, offset: number) {
    if (!active.current) return;
    const next = replaceStop(gradient, index, { offset });
    active.current.next = next;
    callbacks.current.onPreview(next);
  }
  function start(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    finish(true);
    onSelect(index);
    event.currentTarget.focus();
    const [min, max] = stopBounds(gradient, index);
    if (min === max || !ramp.current) return;
    const bounds = ramp.current.getBoundingClientRect();
    active.current = {
      index,
      next: gradient,
      button: event.currentTarget,
      pointerId: event.pointerId,
      left: bounds.left,
      width: bounds.width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const gesture = active.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.width <= 0) return;
    event.currentTarget.setAttribute("data-dragging", "true");
    preview(gesture.index, (event.clientX - gesture.left) / gesture.width);
  }
  function key(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Escape") {
      event.preventDefault();
      blockedKey.current = true;
      finish(true);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
      return;
    event.preventDefault();
    if (disabled || (blockedKey.current && event.repeat)) return;
    blockedKey.current = false;
    const [min, max] = stopBounds(gradient, index);
    if (min === max) return;
    onSelect(index);
    active.current ??= { index, next: gradient, button: event.currentTarget, left: 0, width: 0 };
    const offset = active.current.next.stops[index]!.offset;
    const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1;
    preview(
      index,
      event.key === "Home"
        ? min
        : event.key === "End"
          ? max
          : offset + direction * (event.shiftKey ? 0.1 : 0.01),
    );
  }
  return (
    <div className={styles.ramp}>
      <div
        ref={ramp}
        data-gradient-ramp
        className={styles.preview}
        role="img"
        aria-label={t("preview")}
        style={{ backgroundImage: gradientRamp(gradient) }}
      />
      {gradient.stops.map((stop, index) => {
        const [min, max] = stopBounds(gradient, index);
        return (
          <button
            type="button"
            role="slider"
            key={index}
            data-gradient-thumb={index}
            aria-label={t("stop", { number: index + 1 })}
            aria-valuemin={min * 100}
            aria-valuemax={max * 100}
            aria-valuenow={stop.offset * 100}
            aria-valuetext={`${Math.round(stop.offset * 100)}%`}
            aria-orientation="horizontal"
            aria-disabled={disabled || min === max || undefined}
            data-selected={selected === index || undefined}
            disabled={disabled}
            className={styles.thumb}
            style={{ left: `${stop.offset * 100}%`, backgroundColor: stop.color }}
            onClick={() => onSelect(index)}
            onPointerDown={(event) => start(event, index)}
            onPointerMove={move}
            onPointerUp={() => finish(false)}
            onPointerCancel={() => finish(true)}
            onLostPointerCapture={() => finish(true)}
            onKeyDown={(event) => key(event, index)}
            onKeyUp={(event) => {
              if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") {
                blockedKey.current = false;
                finish(false);
              }
            }}
            onBlur={() => finish(false)}
          />
        );
      })}
    </div>
  );
}

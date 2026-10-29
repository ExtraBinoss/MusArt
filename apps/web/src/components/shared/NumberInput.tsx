// Adapted from ResumI apps/web/src/ui/number-input.tsx, MIT.
// Copyright (c) 2026 ResumI contributors. See docs/legal/resumi-MIT.txt.
// Adaptation: imperative drafts and one validated commit per gesture.
import { useId, useLayoutEffect, useMemo, useRef, type PointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/input";
import { useResetFeedback } from "./use-reset-feedback";

export interface NumberInputProps {
  label: string;
  identity?: unknown;
  value: number;
  resetValue?: number | (() => number);
  onCommit: (value: number) => void;
  onPreview?: (value: number) => void;
  onCancel?: () => void;
  onStart?: () => void;
  mixed?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  scrubLabel?: ReactNode;
  decimalScale?: number;
  snapPoints?: readonly number[];
  snapThreshold?: number;
  /** Imperative animated values; null means the selected owners have mixed values. */
  presentation?: { read(): number | null; subscribe(listener: () => void): () => void };
}
/** A single field with a scrub handle, native number editing and a quiet unit. */
export function NumberInput({
  label,
  identity,
  value,
  resetValue = 0,
  onCommit,
  onPreview,
  onCancel,
  onStart,
  mixed = false,
  min = -100000,
  max = 100000,
  step = 1,
  unit,
  disabled,
  scrubLabel,
  decimalScale = 2,
  snapPoints,
  snapThreshold = 2,
  presentation,
}: NumberInputProps) {
  const { t } = useTranslation();
  const id = useId();
  const element = useRef<HTMLDivElement>(null);
  const resetFeedback = useResetFeedback(element);
  const field = useRef<HTMLInputElement>(null);
  const gesture = useRef<{
    x: number;
    value: number;
    next: number;
    moved: boolean;
    origin: object;
    handle: HTMLButtonElement;
    pointerId: number;
  } | null>(null);
  const heldKey = useRef<object | null>(null),
    blockedKey = useRef(false),
    typing = useRef(false),
    cancelRef = useRef(onCancel);
  const skipBlur = useRef(false);
  const committed = useRef(value);
  const precision = 10 ** Math.min(2, Math.max(0, decimalScale));
  const origin = useMemo(
    () => ({ identity, value, mixed, precision }),
    [identity, value, mixed, precision],
  );
  useLayoutEffect(() => {
    cancelRef.current = onCancel;
  }, [onCancel]);
  useLayoutEffect(
    () => () => {
      const active = gesture.current;
      if (active || heldKey.current || typing.current) {
        gesture.current = null;
        if (heldKey.current) blockedKey.current = true;
        heldKey.current = null;
        typing.current = false;
        active?.handle.parentElement?.removeAttribute("data-dragging");
        if (active?.handle.hasPointerCapture(active.pointerId))
          active.handle.releasePointerCapture(active.pointerId);
        cancelRef.current?.();
      }
    },
    [origin],
  );
  const display = (next: number) => String(Math.round(next * precision) / precision);
  const originalDisplay = () => (mixed ? "" : display(committed.current));
  useLayoutEffect(() => {
    committed.current = value;
    if ((!gesture.current || gesture.current.origin !== origin) && field.current)
      field.current.value = mixed ? "" : String(Math.round(value * precision) / precision);
  }, [value, mixed, precision, origin]);
  useLayoutEffect(() => {
    if (!presentation) return;
    const update = () => {
      const next = presentation.read();
      if (next !== null && !Number.isFinite(next)) return;
      const active = gesture.current;
      if (active || heldKey.current || typing.current) {
        gesture.current = null;
        if (heldKey.current) blockedKey.current = true;
        heldKey.current = null;
        typing.current = false;
        active?.handle.parentElement?.removeAttribute("data-dragging");
        if (active?.handle.hasPointerCapture(active.pointerId))
          active.handle.releasePointerCapture(active.pointerId);
        cancelRef.current?.();
      }
      if (next !== null) committed.current = next;
      if (field.current) {
        field.current.value = next === null ? "" : String(Math.round(next * precision) / precision);
        field.current.placeholder =
          next === null ? t("layerControls:mixed", { defaultValue: "—" }) : "";
      }
    };
    const stop = presentation.subscribe(update);
    update();
    return stop;
  }, [presentation, precision, t]);
  function bounded(next: number) {
    return Math.round(Math.min(max, Math.max(min, next)) * precision) / precision;
  }
  function parse(raw: string) {
    const parsed = Number(raw);
    return raw.trim() && Number.isFinite(parsed) ? bounded(parsed) : null;
  }
  function preview(next: number) {
    if (field.current) field.current.value = display(next);
    onPreview?.(next);
  }
  function commit(next: number) {
    typing.current = false;
    heldKey.current = null;
    if (mixed || next !== committed.current) {
      committed.current = next;
      onCommit(next);
    } else onCancel?.();
  }
  function commitInput(input: HTMLInputElement) {
    typing.current = false;
    heldKey.current = null;
    if (input.value === originalDisplay()) {
      onCancel?.();
      return;
    }
    const next = parse(input.value);
    if (next === null) {
      input.value = originalDisplay();
      onCancel?.();
    } else {
      input.value = display(next);
      commit(next);
    }
  }
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || disabled) return;
    event.preventDefault();
    onStart?.();
    const initial = parse(field.current?.value ?? "") ?? committed.current;
    gesture.current = {
      x: event.clientX,
      value: initial,
      next: initial,
      moved: false,
      origin,
      handle: event.currentTarget,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active || active.origin !== origin) return;
    const distance = event.clientX - active.x;
    if (!active.moved && Math.abs(distance) < 3) return;
    active.moved = true;
    let next = bounded(
      Math.round((active.value + distance * step * (event.shiftKey ? 2 : 0.2)) / step) * step,
    );
    const snapped = snapPoints?.find((point) => Math.abs(point - next) <= snapThreshold);
    next = bounded(snapped ?? next);
    active.next = next;
    event.currentTarget.parentElement?.setAttribute("data-dragging", "true");
    preview(next);
  }
  function finish(event: PointerEvent<HTMLButtonElement>, cancel = false) {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    event.currentTarget.parentElement?.removeAttribute("data-dragging");
    if (cancel || active.origin !== origin) {
      if (field.current) field.current.value = originalDisplay();
      onCancel?.();
    } else if (active.moved) commit(active.next);
    else {
      field.current?.focus();
      field.current?.select();
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function reset() {
    if (disabled) return;
    const active = gesture.current;
    gesture.current = null;
    if (heldKey.current) blockedKey.current = true;
    heldKey.current = null;
    typing.current = false;
    active?.handle.parentElement?.removeAttribute("data-dragging");
    if (active?.handle.hasPointerCapture(active.pointerId))
      active.handle.releasePointerCapture(active.pointerId);
    onCancel?.();
    const sourceValue = typeof resetValue === "function" ? resetValue() : resetValue;
    if (!Number.isFinite(sourceValue)) {
      skipBlur.current = true;
      if (field.current) field.current.value = originalDisplay();
      return;
    }
    const next = bounded(sourceValue);
    skipBlur.current = true;
    if (field.current) field.current.value = display(next);
    if (mixed || next !== committed.current) {
      committed.current = next;
      onCommit(next);
    }
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) resetFeedback();
  }
  return (
    <div
      ref={element}
      className="number-field reset-feedback"
      data-disabled={disabled || undefined}
    >
      <button
        type="button"
        className="number-scrub"
        tabIndex={-1}
        disabled={disabled}
        aria-label={t("adjustValue", { label })}
        title={t("adjustHint")}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          reset();
        }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => finish(event, true)}
      >
        {scrubLabel ?? label}
      </button>
      <Input
        id={id}
        ref={field}
        type="text"
        inputMode="decimal"
        aria-label={label}
        defaultValue={mixed ? "" : display(value)}
        placeholder={mixed ? t("layerControls:mixed", { defaultValue: "—" }) : undefined}
        onFocus={() => {
          skipBlur.current = false;
          onStart?.();
        }}
        disabled={disabled}
        onChange={(event) => {
          skipBlur.current = false;
          typing.current = true;
          onStart?.();
          const next = parse(event.currentTarget.value);
          if (next !== null) onPreview?.(next);
        }}
        onBlur={(event) => {
          typing.current = false;
          if (skipBlur.current) {
            skipBlur.current = false;
            return;
          }
          commitInput(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitInput(event.currentTarget);
            skipBlur.current = true;
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            if (heldKey.current) blockedKey.current = true;
            heldKey.current = null;
            typing.current = false;
            const active = gesture.current;
            gesture.current = null;
            active?.handle.parentElement?.removeAttribute("data-dragging");
            if (active?.handle.hasPointerCapture(active.pointerId))
              active.handle.releasePointerCapture(active.pointerId);
            skipBlur.current = true;
            event.currentTarget.value = originalDisplay();
            onCancel?.();
            event.currentTarget.blur();
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            if (blockedKey.current) {
              if (event.repeat) return;
              blockedKey.current = false;
            }
            if (heldKey.current && heldKey.current !== origin) return;
            heldKey.current = origin;
            onStart?.();
            preview(
              bounded(
                (parse(event.currentTarget.value) ?? committed.current) +
                  (event.key === "ArrowUp" ? 1 : -1) * step * (event.shiftKey ? 10 : 1),
              ),
            );
          }
        }}
        onKeyUp={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            if (blockedKey.current) {
              blockedKey.current = false;
              heldKey.current = null;
              onCancel?.();
              return;
            }
            if (heldKey.current && heldKey.current !== origin) {
              heldKey.current = null;
              onCancel?.();
              return;
            }
            commitInput(event.currentTarget);
          }
        }}
      />
      <span className="number-unit" aria-hidden>
        {unit ?? "—"}
      </span>
    </div>
  );
}

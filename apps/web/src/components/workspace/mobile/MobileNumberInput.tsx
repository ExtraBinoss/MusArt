import { useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { NumberInputProps } from "../../shared/NumberInput";
import { Slider } from "../../ui/slider";
import { createSliderValue } from "../../ui/slider-value";
import { Input } from "../../ui/input";
import "./messages";

/** Only the retained Radix slider subscribes to drafts. Ancestors never receive preview state. */
export function MobileNumberInput({
  label,
  value,
  resetValue = 0,
  identity,
  min = -100000,
  max = 100000,
  step = 1,
  decimalScale = 2,
  unit,
  mixed,
  disabled,
  onStart,
  onPreview,
  onCommit,
  onCancel,
  presentation,
  snapPoints,
  snapThreshold = 2,
}: NumberInputProps) {
  const { t } = useTranslation();
  const field = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const precision = 10 ** Math.min(2, Math.max(0, decimalScale));
  const source = useMemo(() => createSliderValue([value]), [value]);
  const callbacks = useRef({ onStart, onPreview, onCommit, onCancel });
  useLayoutEffect(() => {
    callbacks.current = { onStart, onPreview, onCommit, onCancel };
  });
  const committed = useRef(value);
  const committedMixed = useRef(Boolean(mixed));
  const blockedKey = useRef(false);
  const pointer = useRef<number | null>(null);
  const blockedPointer = useRef(false);
  const active = useRef(false);
  const skipBlur = useRef(false);
  const cancelKey = useRef(false);
  const keyboard = useRef(false);
  const bound = (next: number) =>
    Math.round(Math.max(min, Math.min(max, next)) * precision) / precision;
  const paint = (next: number) => {
    source.set([next]);
    if (field.current) field.current.value = String(Math.round(next * precision) / precision);
  };
  function start() {
    if (active.current || disabled || blockedKey.current || blockedPointer.current) return;
    callbacks.current.onStart?.();
    active.current = true;
    row.current?.setAttribute("data-mobile-adjusting", "true");
  }
  function clear() {
    active.current = false;
    row.current?.removeAttribute("data-mobile-adjusting");
  }
  function cancel() {
    if (!active.current) return;
    clear();
    paint(committed.current);
    if (committedMixed.current && field.current) field.current.value = "";
    callbacks.current.onCancel?.();
  }
  function commit(next: number) {
    if (!active.current) return;
    clear();
    const bounded = bound(next);
    paint(bounded);
    if (committedMixed.current || bounded !== committed.current) {
      committed.current = bounded;
      committedMixed.current = false;
      callbacks.current.onCommit(bounded);
    } else callbacks.current.onCancel?.();
  }
  useLayoutEffect(() => {
    const node = row.current;
    source.set([value]);
    committed.current = value;
    committedMixed.current = Boolean(mixed);
    if (field.current)
      field.current.value = mixed ? "" : String(Math.round(value * precision) / precision);
    return () => {
      if (active.current) {
        blockedKey.current = keyboard.current;
        blockedPointer.current = pointer.current !== null;
        active.current = false;
        node?.removeAttribute("data-mobile-adjusting");
        callbacks.current.onCancel?.();
      }
    };
  }, [identity, value, mixed, precision, disabled, source]);
  useLayoutEffect(() => {
    if (!presentation) return;
    const update = () => {
      const next = presentation.read();
      if (next !== null && !Number.isFinite(next)) return;
      if (active.current) {
        blockedKey.current = keyboard.current;
        blockedPointer.current = pointer.current !== null;
        clear();
        callbacks.current.onCancel?.();
      }
      committedMixed.current = next === null;
      if (next !== null) {
        committed.current = next;
        source.set([next]);
      }
      if (field.current) {
        field.current.value = next === null ? "" : String(Math.round(next * precision) / precision);
        field.current.placeholder = next === null ? "—" : "";
      }
    };
    update();
    return presentation.subscribe(update);
  }, [presentation, source, precision]);
  // Unbounded geometry fields get a useful local range; the precise input retains the full domain.
  const low = min <= -100000 ? Math.min(-1000, value - 1000) : min;
  const high = max >= 100000 ? Math.max(1000, value + 1000) : max;
  return (
    <div className="mobile-number-field" ref={row} data-disabled={disabled || undefined}>
      <div className="mobile-number-heading">
        <button
          type="button"
          className="mobile-number-reset"
          disabled={disabled}
          title={t("adjustHint")}
          onDoubleClick={() => {
            cancel();
            const next = typeof resetValue === "function" ? resetValue() : resetValue;
            if (!Number.isFinite(next)) return;
            start();
            commit(bound(next));
          }}
        >
          {label}
        </button>
        <div>
          <Input
            ref={field}
            type="text"
            inputMode="decimal"
            aria-label={label}
            title={t("mobile:precision", { label })}
            defaultValue={mixed ? "" : value}
            placeholder={mixed ? "—" : undefined}
            disabled={disabled}
            onFocus={() => {
              skipBlur.current = false;
            }}
            onChange={(event) => {
              if (disabled || blockedKey.current || blockedPointer.current) return;
              start();
              const raw = event.currentTarget.value;
              const next = Number(raw);
              if (raw.trim() && Number.isFinite(next)) {
                source.set([bound(next)]);
                callbacks.current.onPreview?.(bound(next));
              }
            }}
            onBlur={(event) => {
              if (skipBlur.current) {
                skipBlur.current = false;
                return;
              }
              const raw = event.currentTarget.value,
                next = Number(raw);
              if (raw.trim() && Number.isFinite(next)) commit(next);
              else cancel();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                skipBlur.current = true;
                cancel();
                event.currentTarget.blur();
              }
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
          <span className="mobile-number-unit" aria-hidden>
            {unit}
          </span>
        </div>
      </div>
      <Slider
        aria-label={t("mobile:slider", { label })}
        valueSource={source}
        min={low}
        max={high}
        step={step}
        disabled={disabled}
        onPointerDownCapture={(event) => {
          if (disabled || event.button !== 0 || pointer.current !== null) return;
          pointer.current = event.pointerId;
          blockedPointer.current = false;
          blockedKey.current = false;
          cancelKey.current = false;
          keyboard.current = false;
          start();
        }}
        onValueChange={(values) => {
          if (disabled || cancelKey.current || blockedKey.current || blockedPointer.current) return;
          start();
          const next = bound(
            snapPoints?.find((point) => Math.abs(point - values[0]!) <= snapThreshold) ??
              values[0]!,
          );
          paint(next);
          callbacks.current.onPreview?.(next);
        }}
        onValueCommit={() => {
          if (
            !cancelKey.current &&
            !keyboard.current &&
            !blockedKey.current &&
            !blockedPointer.current
          )
            commit(source.read()[0]!);
        }}
        onPointerUp={(event) => {
          if (pointer.current !== event.pointerId) return;
          if (active.current && !blockedPointer.current) commit(source.read()[0]!);
          pointer.current = null;
          blockedPointer.current = false;
        }}
        onPointerCancel={(event) => {
          if (pointer.current !== event.pointerId) return;
          cancel();
          pointer.current = null;
          blockedPointer.current = false;
        }}
        onLostPointerCapture={(event) => {
          if (pointer.current !== event.pointerId) return;
          cancel();
          pointer.current = null;
          blockedPointer.current = false;
        }}
        onKeyDownCapture={(event) => {
          if (disabled) return;
          if (blockedKey.current && event.repeat) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (!event.repeat) blockedKey.current = false;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancelKey.current = true;
            cancel();
          } else if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(event.key)
          ) {
            cancelKey.current = false;
            keyboard.current = true;
            start();
          }
        }}
        onKeyUp={(event) => {
          keyboard.current = false;
          if (blockedKey.current) {
            blockedKey.current = false;
            return;
          }
          if (event.key !== "Escape" && active.current) commit(source.read()[0]!);
        }}
        onBlur={() => {
          if (active.current && !blockedKey.current && !blockedPointer.current)
            commit(source.read()[0]!);
          keyboard.current = false;
        }}
      />
    </div>
  );
}

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { useResetFeedback } from "../../shared/use-reset-feedback";
import { ColorControl } from "../ColorControl";
/** One parent-owned palette slot, with a standalone fallback for isolated controls. */
export function EffectColor({
  label,
  value,
  disabled,
  identity,
  open,
  onOpenChange,
  resetValue,
  onReset,
  onStart,
  onPreview,
  onCommit,
  onCancel,
  invalidation,
}: {
  label: string;
  value: string;
  disabled: boolean;
  identity?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  resetValue?: string;
  onReset?: () => void;
  onStart?: () => void;
  onPreview: (color: string) => void;
  onCommit: (color: string) => void;
  onCancel?: () => void;
  invalidation?: { subscribe(listener: () => void): () => void };
}) {
  const { t } = useTranslation();
  const [localOpen, setLocalOpen] = useState(false);
  const shown = !disabled && (open ?? localOpen);
  const row = useRef<HTMLDivElement>(null),
    swatch = useRef<HTMLSpanElement>(null),
    active = useRef(false);
  const feedback = useResetFeedback(row);
  const latest = useRef({ value, disabled, onStart, onPreview, onCommit, onCancel });
  useLayoutEffect(() => {
    latest.current = { value, disabled, onStart, onPreview, onCommit, onCancel };
  }, [value, disabled, onStart, onPreview, onCommit, onCancel]);
  const cancel = useCallback(() => {
    if (swatch.current) swatch.current.style.background = latest.current.value;
    latest.current.onCancel?.();
  }, []);
  const close = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    cancel();
  }, [cancel]);
  useLayoutEffect(() => {
    active.current = shown;
    return close;
  }, [shown, identity, close]);
  const preview = useCallback((color: string) => {
    const current = latest.current;
    if (!active.current || current.disabled) return;
    current.onStart?.();
    if (swatch.current) swatch.current.style.background = color;
    current.onPreview(color);
  }, []);
  const commit = useCallback((color: string) => {
    if (active.current && !latest.current.disabled) latest.current.onCommit(color);
  }, []);
  const cancelPreview = useCallback(() => {
    if (active.current) cancel();
  }, [cancel]);
  function changeOpen(next: boolean) {
    if (next && disabled) return;
    if (!next) close();
    if (open === undefined) setLocalOpen(next);
    onOpenChange?.(next);
  }
  function reset() {
    if (disabled || !onReset) return;
    changeOpen(false);
    if (resetValue === undefined || value.toLowerCase() !== resetValue.toLowerCase()) onReset();
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) feedback();
  }
  return (
    <div ref={row} className="effect-color-field reset-feedback">
      {onReset ? (
        <button
          type="button"
          className="effect-color-label"
          aria-label={`${t("reset")} · ${label}`}
          title={resetValue?.toUpperCase()}
          disabled={disabled}
          onPointerDown={(event) => {
            if (event.button === 0) {
              event.preventDefault();
              changeOpen(false);
            }
          }}
          onClick={(event) => {
            if (event.detail === 0) reset();
          }}
          onDoubleClick={reset}
        >
          {label}
        </button>
      ) : (
        <span>{label}</span>
      )}
      <Popover open={shown} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" aria-label={label} disabled={disabled}>
            <span ref={swatch} className="color-swatch" style={{ background: value }} />
            {value.toUpperCase()}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="left"
          sideOffset={12}
          className="floating-panel effect-color-popover"
          data-effect-color-popover
          aria-label={`${t("colorPicker")} · ${label}`}
          onCloseAutoFocus={(event) => {
            if (document.querySelector('[data-effect-color-popover][data-state="open"]'))
              event.preventDefault();
          }}
        >
          <ColorControl
            invalidation={invalidation}
            value={value}
            identity={identity}
            alpha={false}
            disabled={disabled}
            onPreview={preview}
            onCommit={commit}
            onCancel={cancelPreview}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { HsvColorPicker, type HsvColor } from "react-colorful";
import { useTranslation } from "react-i18next";
import { Slider } from "../../ui/slider";
import { hexToHsva, hsvaToHex, type Hsva } from "./conversion";
import "./color.css";

export function ColorPalette({
  value,
  onPreview,
  onCommit,
  onCancel,
  disabled = false,
  alpha = true,
  resetKey = "",
}: {
  disabled?: boolean;
  alpha?: boolean;
  resetKey?: string;
  value: string;
  onPreview: (hex: string) => void | boolean;
  onCommit: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const origin = useMemo(() => ({ value, resetKey }), [value, resetKey]);
  const [draft, setDraft] = useState<{ origin: typeof origin; color: Hsva } | null>(null);
  const [cycle, setCycle] = useState(0);
  const epoch = useRef(0);
  const mounted = useRef(false);
  const color = draft?.origin === origin ? draft.color : hexToHsva(value);
  const current = useRef(color),
    pad = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; origin: typeof origin; box: DOMRect } | null>(null);
  const samplePointer = useRef<(event: PointerEvent) => boolean>(() => false);
  useLayoutEffect(() => {
    current.current = color;
  }, [color]);
  useLayoutEffect(() => {
    pad.current
      ?.querySelector('.react-colorful__saturation [role="slider"]')
      ?.setAttribute("aria-label", t("pickerSaturation"));
  }, [t, resetKey, value, cycle]);
  function preview(patch: Partial<Hsva>) {
    if (!mounted.current || disabled) return false;
    const next = { ...current.current, ...patch, ...(!alpha ? { a: 1 } : {}) };
    if (onPreview(hsvaToHex(next)) === false) return false;
    current.current = next;
    setDraft({ origin, color: next });
    return true;
  }
  const latest = useRef({ origin, disabled, preview, onCommit, onCancel });
  useLayoutEffect(() => {
    latest.current = { origin, disabled, preview, onCommit, onCancel };
  });
  useLayoutEffect(
    () => () => {
      pointer.current = null;
    },
    [origin],
  );
  useLayoutEffect(() => {
    mounted.current = true;
    function sample(event: PointerEvent) {
      const gesture = pointer.current,
        state = latest.current;
      if (
        !mounted.current ||
        !gesture ||
        gesture.id !== event.pointerId ||
        gesture.origin !== state.origin ||
        state.disabled
      )
        return false;
      const unit = (value: number) => Math.min(1, Math.max(0, value));
      return state.preview({
        h: Math.round(current.current.h),
        s: Math.round(unit((event.clientX - gesture.box.left) / gesture.box.width) * 100),
        v: Math.round((1 - unit((event.clientY - gesture.box.top) / gesture.box.height)) * 100),
      });
    }
    function move(event: PointerEvent) {
      sample(event);
    }
    function retire() {
      pointer.current = null;
      epoch.current++;
      setCycle(epoch.current);
    }
    function release(event: PointerEvent) {
      if (!pointer.current || pointer.current.id !== event.pointerId) return;
      const valid = sample(event);
      // Retire this genuine widget's pending effects before they can echo an old
      // color after the synchronous final sample has been committed.
      retire();
      if (valid) latest.current.onCommit();
    }
    function cancel(event: PointerEvent) {
      if (!pointer.current || pointer.current.id !== event.pointerId) return;
      retire();
      latest.current.onCancel?.();
    }
    samplePointer.current = sample;
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", cancel, true);
    return () => {
      mounted.current = false;
      pointer.current = null;
      samplePointer.current = () => false;
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", cancel, true);
    };
  }, []);
  return (
    <div
      className="color-channels"
      data-alpha={alpha}
      inert={disabled || undefined}
      aria-disabled={disabled || undefined}
    >
      <div
        ref={pad}
        className="color-sv-pad"
        onPointerDownCapture={(event) => {
          if (disabled || event.button !== 0) return;
          const box = pad.current
            ?.querySelector<HTMLElement>(".react-colorful__saturation")
            ?.getBoundingClientRect();
          if (box && box.width > 0 && box.height > 0) {
            pointer.current = { id: event.pointerId, origin, box };
            samplePointer.current(event.nativeEvent);
          }
        }}
      >
        <HsvColorPicker
          key={`${resetKey}:${value}:${cycle}`}
          color={{ h: color.h, s: color.s, v: color.v }}
          onChange={(next: HsvColor) => {
            if (
              mounted.current &&
              !pointer.current &&
              epoch.current === cycle &&
              latest.current.origin === origin &&
              !latest.current.disabled
            )
              latest.current.preview(next);
          }}
          onChangeEnd={() => {
            if (
              mounted.current &&
              !pointer.current &&
              epoch.current === cycle &&
              latest.current.origin === origin &&
              !latest.current.disabled
            )
              latest.current.onCommit();
          }}
        />
      </div>
      <Slider
        className="color-channel color-hue"
        disabled={disabled}
        aria-label={t("hue")}
        orientation="vertical"
        inverted
        min={0}
        max={360}
        step={1}
        value={[color.h]}
        onValueChange={([h]) => preview({ h: h! })}
      />
      {alpha && (
        <Slider
          className="color-channel color-alpha"
          disabled={disabled}
          aria-label={t("alpha")}
          orientation="vertical"
          min={0}
          max={100}
          step={1}
          value={[color.a * 100]}
          style={{ "--color-channel-fill": hsvaToHex({ ...color, a: 1 }) } as CSSProperties}
          onValueChange={([a]) => preview({ a: a! / 100 })}
        />
      )}
    </div>
  );
}

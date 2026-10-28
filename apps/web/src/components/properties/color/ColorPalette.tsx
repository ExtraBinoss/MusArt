import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { HsvColorPicker, type HsvColor } from "react-colorful";
import { useTranslation } from "react-i18next";
import { Slider } from "../../ui/slider";
import { hexToHsva, hsvaToHex, type Hsva } from "./conversion";
import "./color.css";

export function ColorPalette({
  value,
  onPreview,
  onCommit,
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
}) {
  const { t } = useTranslation();
  const origin = useMemo(() => ({ value, resetKey }), [value, resetKey]);
  const [draft, setDraft] = useState<{ origin: typeof origin; color: Hsva } | null>(null);
  const color = draft?.origin === origin ? draft.color : hexToHsva(value);
  const current = useRef(color),
    pad = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    current.current = color;
  }, [color]);
  useEffect(() => {
    pad.current
      ?.querySelector('.react-colorful__saturation [role="slider"]')
      ?.setAttribute("aria-label", t("pickerSaturation"));
  }, [t, resetKey]);
  function preview(patch: Partial<Hsva>) {
    if (disabled) return;
    const next = { ...current.current, ...patch, ...(!alpha ? { a: 1 } : {}) };
    if (onPreview(hsvaToHex(next)) === false) return;
    current.current = next;
    setDraft({ origin, color: next });
  }
  return (
    <div
      className="color-channels"
      data-alpha={alpha}
      inert={disabled || undefined}
      aria-disabled={disabled || undefined}
    >
      <div ref={pad} className="color-sv-pad">
        <HsvColorPicker
          key={resetKey}
          color={{ h: color.h, s: color.s, v: color.v }}
          onChange={(next: HsvColor) => preview(next)}
          onChangeEnd={onCommit}
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

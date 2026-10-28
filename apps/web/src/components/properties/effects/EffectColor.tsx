import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { ColorControl } from "../ColorControl";
/** Palette colors remain compact until the user explicitly opens the shared picker. */
export function EffectColor({
  label,
  value,
  disabled,
  onStart,
  onPreview,
  onCommit,
  onCancel,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onStart?: () => void;
  onPreview: (color: string) => void;
  onCommit: (color: string) => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const swatch = useRef<HTMLSpanElement>(null);
  function cancel() {
    if (swatch.current) swatch.current.style.background = value;
    onCancel?.();
  }
  return (
    <div className="effect-color-field">
      <span>{label}</span>
      <Popover
        onOpenChange={(open) => {
          if (open) onStart?.();
          else cancel();
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" aria-label={label} disabled={disabled}>
            <span ref={swatch} className="color-swatch" style={{ background: value }} />
            {value.toUpperCase()}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="left"
          className="floating-panel effect-color-popover"
          aria-label={`${t("colorPicker")} · ${label}`}
        >
          <ColorControl
            value={value}
            alpha={false}
            disabled={disabled}
            onPreview={(color) => {
              onStart?.();
              if (swatch.current) swatch.current.style.background = color;
              onPreview(color);
            }}
            onCommit={onCommit}
            onCancel={cancel}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

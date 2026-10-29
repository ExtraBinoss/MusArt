import { useLayoutEffect, useMemo, useRef } from "react";
import { Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FillGradient, GradientStop } from "@musart/core";
import { IconButton } from "../../shared/IconButton";
import { NumberInput } from "../../shared/NumberInput";
import { Input } from "../../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { ColorControl } from "../ColorControl";
import { stopBounds, stopColorFields, withHexColor, withOpacity } from "./paint";
import styles from "./GradientControl.module.css";

interface Props {
  gradient: FillGradient;
  index: number;
  ownerId: string;
  identity: unknown;
  selected: boolean;
  disabled?: boolean;
  invalidation?: { subscribe(listener: () => void): () => void };
  onSelect: () => void;
  onPreview: (change: Partial<GradientStop>) => void;
  onCommit: (change: Partial<GradientStop>) => void;
  onCancel: () => void;
  onRemove: () => void;
}

export function GradientStopRow({
  gradient,
  index,
  ownerId,
  identity,
  selected,
  disabled,
  invalidation,
  onSelect,
  onPreview,
  onCommit,
  onCancel,
  onRemove,
}: Props) {
  const { t } = useTranslation("gradient");
  const stop = gradient.stops[index]!;
  const fields = stopColorFields(stop.color);
  const [min, max] = stopBounds(gradient, index);
  const endpoint = index === 0 || index === gradient.stops.length - 1;
  const positionPresentation = useMemo(
    () =>
      invalidation && {
        subscribe: (listener: () => void) => invalidation.subscribe(listener),
        read: () => stop.offset * 100,
      },
    [invalidation, stop.offset],
  );
  const opacityPresentation = useMemo(
    () =>
      invalidation && {
        subscribe: (listener: () => void) => invalidation.subscribe(listener),
        read: () => fields.opacity,
      },
    [invalidation, fields.opacity],
  );
  const number = index + 1;
  return (
    <div
      className={styles.row}
      data-gradient-row={index}
      data-selected={selected || undefined}
      onFocusCapture={onSelect}
      onPointerDownCapture={onSelect}
    >
      <div data-gradient-position>
        <NumberInput
          identity={identity}
          presentation={positionPresentation}
          label={t("stopPosition", { number })}
          value={stop.offset * 100}
          min={min * 100}
          max={max * 100}
          resetValue={(min + max) * 50}
          disabled={disabled || min === max}
          unit="%"
          onPreview={(offset) => onPreview({ offset: offset / 100 })}
          onCommit={(offset) => onCommit({ offset: offset / 100 })}
          onCancel={onCancel}
        />
      </div>
      <div className={styles.hexField}>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={styles.swatchButton}
              aria-label={t("stopColor", { number })}
            >
              <span data-gradient-swatch style={{ backgroundColor: stop.color }} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="left"
            align="start"
            className={styles.colorPopover}
            aria-label={t("stopColor", { number })}
          >
            <ColorControl
              identity={`${ownerId}:${index}`}
              value={stop.color}
              disabled={disabled}
              invalidation={invalidation}
              onPreview={(color) => onPreview({ color })}
              onCommit={(color) => onCommit({ color })}
              onCancel={onCancel}
            />
          </PopoverContent>
        </Popover>
        <StopHexInput
          color={stop.color}
          identity={identity}
          label={t("stopHex", { number })}
          disabled={disabled}
          invalidation={invalidation}
          onPreview={(color) => onPreview({ color })}
          onCommit={(color) => onCommit({ color })}
          onCancel={onCancel}
        />
      </div>
      <div data-gradient-opacity>
        <NumberInput
          identity={identity}
          presentation={opacityPresentation}
          label={t("stopOpacity", { number })}
          value={fields.opacity}
          min={0}
          max={100}
          resetValue={100}
          unit="%"
          disabled={disabled}
          onPreview={(opacity) => onPreview({ color: withOpacity(stop.color, opacity) })}
          onCommit={(opacity) => onCommit({ color: withOpacity(stop.color, opacity) })}
          onCancel={onCancel}
        />
      </div>
      <IconButton
        className={styles.remove}
        label={t("removeStop", { number })}
        disabled={disabled || gradient.stops.length <= 2 || endpoint}
        onClick={onRemove}
      >
        <Minus size={13} />
      </IconButton>
    </div>
  );
}

function StopHexInput({
  color,
  identity,
  label,
  disabled,
  invalidation,
  onPreview,
  onCommit,
  onCancel,
}: {
  color: string;
  identity: unknown;
  label: string;
  disabled?: boolean;
  invalidation?: { subscribe(listener: () => void): () => void };
  onPreview: (color: string) => void;
  onCommit: (color: string) => void;
  onCancel: () => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const dirty = useRef(false);
  const skipBlur = useRef(false);
  const cancel = useRef(onCancel);
  useLayoutEffect(() => {
    cancel.current = onCancel;
  }, [onCancel]);
  useLayoutEffect(() => {
    if (field.current) field.current.value = stopColorFields(color).hex;
    return () => {
      if (dirty.current) {
        dirty.current = false;
        cancel.current();
      }
    };
  }, [color, identity, disabled]);
  useLayoutEffect(
    () =>
      invalidation?.subscribe(() => {
        if (!dirty.current) return;
        dirty.current = false;
        if (field.current) field.current.value = stopColorFields(color).hex;
        cancel.current();
      }),
    [invalidation, color],
  );
  function reset() {
    dirty.current = false;
    if (field.current) field.current.value = stopColorFields(color).hex;
    onCancel();
  }
  function finish() {
    const value = field.current?.value.trim() ?? "";
    const next = withHexColor(color, value.startsWith("#") ? value : `#${value}`);
    if (!dirty.current) return;
    dirty.current = false;
    if (next && next !== withHexColor(color, color)) onCommit(next);
    else reset();
  }
  return (
    <Input
      ref={field}
      data-gradient-hex
      aria-label={label}
      disabled={disabled}
      defaultValue={stopColorFields(color).hex}
      spellCheck={false}
      autoComplete="off"
      maxLength={11}
      onFocus={() => {
        skipBlur.current = false;
      }}
      onChange={(event) => {
        dirty.current = true;
        skipBlur.current = false;
        const value = event.currentTarget.value.trim();
        const next = withHexColor(color, value.startsWith("#") ? value : `#${value}`);
        if (next) onPreview(next);
      }}
      onBlur={() => {
        if (!skipBlur.current) finish();
        skipBlur.current = false;
      }}
      onPointerCancel={reset}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== "Escape") return;
        event.preventDefault();
        if (event.key === "Escape") reset();
        else finish();
        skipBlur.current = true;
        event.currentTarget.blur();
      }}
    />
  );
}

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../ui/select";
export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}
/** Accessible Radix listbox, with optional imperative hover/focus drafts separate from selection. */
export function SelectField({
  label,
  value,
  options,
  onValueChange,
  onPreview,
  onPreviewCancel,
  id,
  disabled,
  className,
  side = "bottom",
  selectedLabel,
}: {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onValueChange: (value: string) => void;
  onPreview?: (value: string) => void;
  onPreviewCancel?: () => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  selectedLabel?: ReactNode;
}) {
  const session = useRef<{ open: boolean; last: string | null }>({ open: false, last: null });
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  if (disabled && open) setOpen(false);
  const cancel = useRef(onPreviewCancel);
  useLayoutEffect(() => {
    cancel.current = onPreviewCancel;
  }, [onPreviewCancel]);
  useEffect(
    () => () => {
      if (session.current.open) cancel.current?.();
    },
    [],
  );
  useLayoutEffect(() => {
    if (disabled && session.current.open) {
      session.current.open = false;
      session.current.last = null;
      cancel.current?.();
    }
  }, [disabled]);
  function preview(option: SelectOption) {
    if (
      disabled ||
      option.disabled ||
      !session.current.open ||
      session.current.last === option.value
    )
      return;
    session.current.last = option.value;
    onPreview?.(option.value);
  }
  return (
    <Select
      value={value}
      open={open && !disabled}
      disabled={disabled}
      onOpenChange={(open) => {
        setOpen(open && !disabled);
        if (open && !disabled) {
          setMounted(true);
          session.current.open = true;
          session.current.last = value;
        } else if (session.current.open) {
          session.current.open = false;
          session.current.last = null;
          cancel.current?.();
        }
      }}
      onValueChange={(next) => {
        if (!disabled && options.some((option) => option.value === next && !option.disabled))
          onValueChange(next);
      }}
    >
      <SelectTrigger
        id={id}
        aria-label={label}
        className={className}
        onFocus={() => {
          if (!disabled) setMounted(true);
        }}
      >
        <span data-slot="select-value" style={{ pointerEvents: "none" }}>
          {value === ""
            ? ""
            : (selectedLabel ?? options.find((option) => option.value === value)?.label ?? value)}
        </span>
      </SelectTrigger>
      {mounted && (
        <SelectContent position="popper" side={side} className="property-select-menu">
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              onPointerMove={() => preview(option)}
              onFocus={() => preview(option)}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      )}
    </Select>
  );
}

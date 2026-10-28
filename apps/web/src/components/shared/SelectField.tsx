import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
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
}) {
  const session = useRef<{ open: boolean; last: string | null }>({ open: false, last: null });
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
      disabled={disabled}
      onOpenChange={(open) => {
        if (open && !disabled) {
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
      <SelectTrigger id={id} aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="property-select-menu">
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
    </Select>
  );
}

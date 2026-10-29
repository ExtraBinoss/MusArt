import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}
export type SelectFieldIdentity = object | string | number | symbol | null;
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
  identity,
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
  identity?: SelectFieldIdentity;
}) {
  const [owner, setOwner] = useState(() => ({ identity, token: {} }));
  const current = useRef<object | null>(owner.token);
  const session = useRef<{
    owner: object;
    open: boolean;
    last: string | null;
    cancel?: () => void;
  }>({ owner: owner.token, open: false, last: null });
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  if (!Object.is(owner.identity, identity)) {
    setOwner({ identity, token: {} });
    setMounted(false);
    setOpen(false);
  }
  if (disabled && open) setOpen(false);
  useLayoutEffect(() => {
    current.current = owner.token;
    const previous = session.current;
    if (previous.owner !== owner.token) {
      session.current = { owner: owner.token, open: false, last: null };
      if (previous.open) previous.cancel?.();
    }
    return () => {
      if (current.current === owner.token) current.current = null;
    };
  }, [owner.token]);
  useLayoutEffect(() => {
    if (session.current.owner === owner.token && session.current.open)
      session.current.cancel = onPreviewCancel;
  }, [owner.token, onPreviewCancel]);
  useEffect(
    () => () => {
      if (session.current.open) session.current.cancel?.();
    },
    [],
  );
  useLayoutEffect(() => {
    if (disabled && session.current.open) {
      session.current.open = false;
      session.current.last = null;
      session.current.cancel?.();
    }
  }, [disabled]);
  function owned() {
    return !disabled && current.current === owner.token;
  }
  function guardItem(event: { preventDefault(): void }) {
    if (!owned() || session.current.owner !== owner.token || !session.current.open)
      event.preventDefault();
  }
  function preview(option: SelectOption) {
    if (
      !owned() ||
      option.disabled ||
      session.current.owner !== owner.token ||
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
        if (!owned()) return;
        setOpen(open && !disabled);
        if (open && !disabled) {
          setMounted(true);
          session.current.open = true;
          session.current.last = value;
          session.current.cancel = onPreviewCancel;
        } else if (session.current.open) {
          session.current.open = false;
          session.current.last = null;
          session.current.cancel?.();
        }
      }}
      onValueChange={(next) => {
        if (owned() && options.some((option) => option.value === next && !option.disabled))
          onValueChange(next);
      }}
    >
      <SelectTrigger
        id={id}
        aria-label={label}
        className={className}
        onFocus={() => {
          if (owned()) setMounted(true);
        }}
      >
        <SelectValue>
          {value === "" ? "" : (options.find((option) => option.value === value)?.label ?? value)}
        </SelectValue>
      </SelectTrigger>
      {mounted && (
        <SelectContent
          position="item-aligned"
          className="property-select-menu"
          onCloseAutoFocus={(event) => {
            if (current.current !== owner.token) event.preventDefault();
          }}
        >
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              onPointerMove={() => preview(option)}
              onFocus={() => preview(option)}
              onClick={guardItem}
              onPointerUp={guardItem}
              onKeyDown={guardItem}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      )}
    </Select>
  );
}

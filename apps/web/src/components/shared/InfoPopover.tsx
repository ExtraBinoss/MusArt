import { useRef, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

/** Contextual help with interactive details; ordinary text-only help uses InfoTooltip. */
export function InfoPopover({
  label,
  children,
  open,
  onOpenChange,
  className = "",
}: {
  label: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const content = useRef<HTMLDivElement>(null);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          className="text-muted-foreground hover:text-foreground"
        >
          <Info size={13} aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          content.current?.focus({ preventScroll: true });
        }}
        align="end"
        aria-label={label}
        className={className}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

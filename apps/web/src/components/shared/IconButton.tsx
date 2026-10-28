import type { ComponentProps, ReactNode } from "react";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function IconButton({
  label,
  children,
  active,
  className = "",
  shortcut,
  ...props
}: Omit<ComponentProps<typeof Button>, "children"> & {
  label: string;
  children: ReactNode;
  active?: boolean;
  shortcut?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={label}
          aria-pressed={active}
          className={`icon-button ${active ? "is-active" : ""} ${className}`}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" className="floating-panel">
        <span>{label}</span>
        {shortcut && (
          <KbdGroup>
            {[...shortcut.split("+").filter(Boolean), ...(shortcut.endsWith("+") ? ["+"] : [])].map(
              (key) => (
                <Kbd key={key}>{key}</Kbd>
              ),
            )}
          </KbdGroup>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

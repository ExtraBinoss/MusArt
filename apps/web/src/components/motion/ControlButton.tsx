import { useContext, type ComponentProps, type ReactNode } from "react";
import { TimelineControlTooltips } from "./control-tooltips";
import { Button } from "../ui/button";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/** Compact controls keep their complete name and verified shortcut discoverable. */
export function TimelineIconButton({
  label,
  shortcut,
  children,
  ...props
}: ComponentProps<typeof Button> & {
  label: string;
  shortcut?: readonly string[];
  children: ReactNode;
}) {
  const richTooltip = useContext(TimelineControlTooltips);
  if (!richTooltip)
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={label}
        title={label}
        {...props}
      >
        {children}
      </Button>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="motion-control-tooltip">
        <span>{label}</span>
        {shortcut && (
          <KbdGroup>
            {shortcut.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

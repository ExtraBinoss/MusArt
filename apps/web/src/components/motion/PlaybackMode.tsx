import { useState } from "react";
import { RadioGroup } from "radix-ui";
import { ArrowLeftRight, Repeat } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import type { TimelineTransportState } from "./model";
import "./messages";

function PlayOnce({ size = 13 }: { size?: number }) {
  return (
    <Repeat size={size} aria-hidden>
      <path d="m4 20 16-16" />
    </Repeat>
  );
}
const icons = { once: PlayOnce, loop: Repeat, pingPong: ArrowLeftRight };
export function PlaybackMode({
  value,
  onChange,
  active = true,
}: {
  value: TimelineTransportState["playbackMode"];
  onChange: (mode: TimelineTransportState["playbackMode"]) => void;
  active?: boolean;
}) {
  const { t } = useTranslation("motion");
  const [open, setOpen] = useState(false);
  const Icon = icons[value];
  return (
    <Popover
      open={open && active}
      onOpenChange={(next) => {
        if (active) setOpen(next);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="motion-playback-mode"
              aria-label={`${t("playback")} · ${t(value)}`}
              disabled={!active}
            >
              <Icon size={13} aria-hidden />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          {t("playback")} · {t(value)}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        className="motion-playback-options"
        side="top"
        align="end"
        aria-label={t("playback")}
        data-canvas-control
        data-keybinding-capture
        inert={!active ? true : undefined}
      >
        <RadioGroup.Root
          orientation="horizontal"
          value={value}
          aria-label={t("playback")}
          onValueChange={(next) => {
            if (active && (next === "once" || next === "loop" || next === "pingPong")) {
              onChange(next);
              setOpen(false);
            }
          }}
        >
          {(["loop", "once", "pingPong"] as const).map((mode) => {
            const ModeIcon = icons[mode];
            return (
              <Tooltip key={mode}>
                <TooltipTrigger asChild>
                  <span className="motion-playback-tooltip-trigger">
                    <RadioGroup.Item
                      value={mode}
                      className="motion-playback-option"
                      aria-label={t(mode)}
                    >
                      <ModeIcon size={15} aria-hidden />
                    </RadioGroup.Item>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">{t(mode)}</TooltipContent>
              </Tooltip>
            );
          })}
        </RadioGroup.Root>
      </PopoverContent>
    </Popover>
  );
}

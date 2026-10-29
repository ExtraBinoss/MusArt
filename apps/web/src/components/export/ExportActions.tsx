import { useCallback, useRef } from "react";
import { ChevronDown, Clapperboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { TimelapseDialog } from "../animation/timelapse/TimelapseDialog";
import { ExportPopover } from "./ExportPopover";
import type { ExportPopoverProps } from "./model";
import "../animation/timelapse/messages";
import "./export.css";

export function ExportActions({
  engine,
  timelapseOpen,
  onTimelapseOpenChange,
  ...props
}: ExportPopoverProps & {
  engine: EnginePort;
  timelapseOpen: boolean;
  onTimelapseOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("timelapse");
  const trigger = useRef<HTMLButtonElement>(null);
  const closeTimelapse = useCallback(() => onTimelapseOpenChange(false), [onTimelapseOpenChange]);
  return (
    <div className="export-actions" role="group" aria-label={t("exportActions")}>
      <ExportPopover {...props} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            size="icon-sm"
            className="export-options"
            aria-label={t("exportOptions")}
          >
            <ChevronDown size={13} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (timelapseOpen) event.preventDefault();
          }}
        >
          <DropdownMenuItem
            onSelect={() => {
              props.onOpenChange(false);
              onTimelapseOpenChange(true);
            }}
          >
            <Clapperboard size={15} />
            {t("menu")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {timelapseOpen && (
        <TimelapseDialog
          engine={engine}
          services={props.services}
          returnFocus={trigger}
          onClose={closeTimelapse}
        />
      )}
    </div>
  );
}

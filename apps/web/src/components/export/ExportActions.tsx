import { useCallback, useEffect, useRef, useState } from "react";
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
import { createMotionTransport } from "../../services/motion/transport";
import { subscribeCompositionExport } from "./composition-request";

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
  const { onOpenChange } = props;
  const trigger = useRef<HTMLButtonElement>(null);
  const [requested, setRequested] = useState<string | undefined>();
  const changeOpen = useCallback(
    (open: boolean) => {
      if (open) createMotionTransport(engine).pause();
      else setRequested(undefined);
      onOpenChange(open);
    },
    [engine, onOpenChange],
  );
  useEffect(
    () =>
      subscribeCompositionExport(engine, (target) => {
        if (target.projectId !== engine.getSnapshot().project.id) return;
        setRequested(target.compositionId);
        changeOpen(true);
      }),
    [engine, changeOpen],
  );
  const closeTimelapse = useCallback(() => onTimelapseOpenChange(false), [onTimelapseOpenChange]);
  return (
    <div className="export-actions" role="group" aria-label={t("exportActions")}>
      <ExportPopover
        {...props}
        engine={engine}
        initialCompositionId={requested}
        onOpenChange={changeOpen}
      />
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

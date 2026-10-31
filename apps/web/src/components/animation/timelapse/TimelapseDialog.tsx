import type { RefObject } from "react";
import type { EnginePort } from "@musart/core";
import type { EditorServices } from "../../../state/contracts";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../ui/dialog";
import { ExportWorkspace } from "../../export/ExportWorkspace";
import "./messages";
import "../../export/messages";
import "../../export/export.css";
export function TimelapseDialog({
  engine,
  services,
  onClose,
  returnFocus,
}: {
  engine: EnginePort;
  services: EditorServices;
  onClose: () => void;
  returnFocus?: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation("timelapse");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="export-dialog"
        data-canvas-control
        data-keybinding-capture
        onCloseAutoFocus={(event) => {
          if (returnFocus?.current) {
            event.preventDefault();
            returnFocus.current.focus();
          }
        }}
      >
        <DialogHeader className="export-dialog-header">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <ExportWorkspace
          engine={engine}
          services={services}
          initialKind="timelapse"
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

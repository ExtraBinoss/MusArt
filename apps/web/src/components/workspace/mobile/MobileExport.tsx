import { useTranslation } from "react-i18next";
import type { ComponentProps } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../ui/dialog";
import { ExportWorkspace } from "../../export/ExportWorkspace";
import type { ExportKind } from "../../../services/export/jobs";
import type { EditorSidebar } from "../EditorSidebar";
import "../../export/messages";
import "../../export/export.css";

type Props = Pick<ComponentProps<typeof EditorSidebar>, "engine" | "services"> & {
  onClose: () => void;
  initialKind?: ExportKind;
  initialCompositionId?: string;
};
/** Mobile uses the same dialog, scope and session-owned export as desktop. */
export function MobileExport({ onClose, ...props }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="export-dialog" data-canvas-control data-keybinding-capture>
        <DialogHeader className="export-dialog-header">
          <DialogTitle>{t("exportTitle")}</DialogTitle>
          <DialogDescription>{t("exportPanel:dialogDescription")}</DialogDescription>
        </DialogHeader>
        <ExportWorkspace {...props} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

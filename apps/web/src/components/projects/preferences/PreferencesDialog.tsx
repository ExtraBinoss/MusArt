import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../ui/dialog";
import { Preferences, type PreferencesSection } from "./Preferences";
import { SnappingPlayground } from "./SnappingPlayground";
import "../dashboard/messages";
export function PreferencesDialog({
  onClose,
  initialSection,
  open,
}: {
  onClose: () => void;
  initialSection?: PreferencesSection;
  open?: boolean;
}) {
  const { t } = useTranslation();
  const [requestedOpen, setRequestedOpen] = useState(true);
  const visible = open ?? requestedOpen;
  const alive = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <Dialog
      open={visible}
      onOpenChange={(next) => {
        if (next) return;
        setRequestedOpen(false);
        if (open !== undefined) onClose();
      }}
    >
      <DialogContent
        closeLabel={t("close")}
        onOpenAutoFocus={() => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
          if (open === undefined && !visible && alive.current) onClose();
        }}
        onEscapeKeyDown={(event) => {
          if (document.activeElement?.getAttribute("data-recording") === "true")
            event.preventDefault();
        }}
        className="floating-panel preferences-dialog preferences-shell"
      >
        <DialogHeader>
          <DialogTitle>{t("settings")}</DialogTitle>
          <DialogDescription>{t("dashboard:preferencesHint")}</DialogDescription>
        </DialogHeader>
        <Preferences
          initialSection={initialSection}
          editorPreview={<SnappingPlayground compact />}
        />
      </DialogContent>
    </Dialog>
  );
}

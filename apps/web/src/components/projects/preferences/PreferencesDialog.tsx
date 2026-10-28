import { useState } from "react";
import { ShortcutsDialog } from "../../search/ShortcutsDialog";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../ui/dialog";
import { Preferences } from "./Preferences";
import "../dashboard/messages";
export function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [shortcuts, setShortcuts] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !shortcuts) onClose();
      }}
    >
      <DialogContent
        closeLabel={t("close")}
        onInteractOutside={(event) => {
          if (shortcuts) event.preventDefault();
        }}
        className="floating-panel preferences-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("settings")}</DialogTitle>
          <DialogDescription>{t("dashboard:preferencesHint")}</DialogDescription>
        </DialogHeader>
        <Preferences onShortcuts={() => setShortcuts(true)} />
        {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
      </DialogContent>
    </Dialog>
  );
}

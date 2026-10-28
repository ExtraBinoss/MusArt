import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { ShortcutSettings } from "./keybindings/ShortcutSettings";

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="floating-panel shortcuts-dialog"
        closeLabel={t("close")}
        onEscapeKeyDown={(event) => {
          if (document.activeElement?.getAttribute("data-recording") === "true")
            event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("search:shortcuts")}</DialogTitle>
          <DialogDescription>{t("keybindings:description")}</DialogDescription>
        </DialogHeader>
        <ShortcutSettings />
      </DialogContent>
    </Dialog>
  );
}

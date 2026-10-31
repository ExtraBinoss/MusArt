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
}: {
  onClose: () => void;
  initialSection?: PreferencesSection;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        closeLabel={t("close")}
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

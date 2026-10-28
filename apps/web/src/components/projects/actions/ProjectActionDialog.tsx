import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogMedia,
} from "../../ui/alert-dialog";
export function ProjectActionDialog({
  name,
  action,
  onCancel,
  onConfirm,
}: {
  name: string;
  action: "delete" | "clearHistory";
  onCancel: () => void;
  onConfirm: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  async function submit() {
    setBusy(true);
    setFailed(false);
    try {
      if (await onConfirm()) onCancel();
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <AlertDialogContent className="floating-panel project-action-dialog">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <AlertTriangle size={24} />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t(action === "delete" ? "deleteNamedProject" : "clearNamedHistory", { name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(action === "delete" ? "deleteProjectDescription" : "clearHistoryDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <p role="alert" className="project-action-error">
            {t("projectActionFailed")}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {busy ? (
              <>
                <LoaderCircle size={14} className="animate-spin" />
                {t("working")}
              </>
            ) : (
              t(action === "delete" ? "confirmedDelete" : "confirmClearHistory")
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

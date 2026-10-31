import { useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { hasActiveExports } from "../../services/export/jobs";
import {
  answerExportLeave,
  exportLeaveRequested,
  subscribeExportLeave,
} from "../../services/export/leave";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../ui/alert-dialog";
import "./messages";

export function ExportLeaveGuard() {
  const { t } = useTranslation("exportPanel");
  const open = useSyncExternalStore(subscribeExportLeave, exportLeaveRequested, () => false);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (!hasActiveExports()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("beforeunload", leave);
      answerExportLeave(false);
    };
  }, []);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) answerExportLeave(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("leaveTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("leaveDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => answerExportLeave(false)}>
            {t("stay")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => answerExportLeave(true)}>
            {t("leave")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

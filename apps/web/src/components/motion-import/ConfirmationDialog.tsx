import { useEffect, useSyncExternalStore } from "react";
import { Clapperboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import { getMotionConfirmation } from "../../state/session/motion-confirmation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import "./messages";

/** Mount once beside the editor. Scrubbing/playing never publishes to this isolated leaf. */
export function MotionImportConfirmation({ engine }: { engine: EnginePort }) {
  const { t } = useTranslation("motionImport");
  const port = getMotionConfirmation(engine);
  const plan = useSyncExternalStore(port.subscribe, port.read, port.read);
  useEffect(() => port.attachHost(), [port]);
  return (
    <AlertDialog
      open={plan !== null}
      onOpenChange={(open) => {
        if (!open && plan) port.respond(plan, false);
      }}
    >
      <AlertDialogContent data-canvas-control data-keybinding-capture>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Clapperboard aria-hidden />
          </AlertDialogMedia>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("description", { count: plan?.layerIds.length ?? 0 })}
          </AlertDialogDescription>
          <p className="text-sm text-muted-foreground">{t("timing")}</p>
          <p className="text-xs text-muted-foreground">{t("groups")}</p>
          <p className="text-xs text-muted-foreground">{t("preserve")}</p>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              if (plan) port.respond(plan, false);
            }}
          >
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (plan) port.respond(plan, true);
            }}
          >
            {t("accept")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

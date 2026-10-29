import { useState } from "react";
import { Diamond, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  planMotionInitialization,
  type EnginePort,
  type MotionInitializationPlan,
  type SessionSnapshot,
} from "@musart/core";
import { SegmentedTabs } from "../shared/segmented/SegmentedTabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import "./messages";
import "./timeline.css";

export function CompositionMode({
  engine,
  snapshot,
  onMotionEnabled,
}: {
  engine: EnginePort;
  snapshot: SessionSnapshot;
  onMotionEnabled?: () => void;
}) {
  const { t } = useTranslation("motion");
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const [pending, setPending] = useState<MotionInitializationPlan | null>(null);
  const [error, setError] = useState("");
  const current = page.motion?.mode ?? "static";
  function choose(value: string) {
    if (value !== "static" && value !== "motion") return;
    if (value === current) return;
    setError("");
    try {
      const live = engine.getSnapshot();
      if (live.pageId !== page.id || live.project.id !== snapshot.project.id) {
        setError("changed");
        return;
      }
      if (value === "motion" && !page.motion) {
        const plan = planMotionInitialization(engine.getSnapshot());
        if (plan.requiresConfirmation) {
          setPending(plan);
          return;
        }
        engine.execute({ type: "setCompositionMode", mode: "motion", plan });
      } else engine.execute({ type: "setCompositionMode", mode: value });
      if (value === "motion") onMotionEnabled?.();
    } catch {
      setError("failed");
    }
  }
  function accept() {
    if (!pending) return;
    try {
      engine.execute({
        type: "setCompositionMode",
        mode: "motion",
        plan: pending,
        confirmed: true,
      });
      setPending(null);
      setError("");
      onMotionEnabled?.();
    } catch {
      setPending(null);
      setError("changed");
    }
  }
  return (
    <div className="motion-mode" data-canvas-control data-keybinding-capture>
      <SegmentedTabs
        tooltips
        mode="choice"
        size="compact"
        value={current}
        label={t("mode")}
        onValueChange={choose}
        items={[
          { value: "static", label: t("static"), icon: <Square size={13} /> },
          { value: "motion", label: t("motion"), icon: <Diamond size={13} /> },
        ]}
      />
      {error && (
        <p className="motion-error" role="alert">
          {t(error)}
        </p>
      )}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent data-canvas-control data-keybinding-capture>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("enableTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("enableDescription", { count: pending?.layerIds.length ?? 0 })}
            </AlertDialogDescription>
            <p className="motion-confirm-hint">{t("groupCount")}</p>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("no")}</AlertDialogCancel>
            <AlertDialogAction onClick={accept}>{t("yes")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

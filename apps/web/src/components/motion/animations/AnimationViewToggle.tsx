import { Sparkles, Diamond } from "lucide-react";
import { getMotionAuthoring } from "../../../state/session/motion-authoring";
import { useTranslation } from "react-i18next";
import type { EnginePort } from "@musart/core";
import { Button } from "../../ui/button";
import { animationPresentation, useAnimationPresentation } from "./presentation";
import "./messages";

export function AnimationViewToggle({ engine }: { engine: EnginePort }) {
  const { t } = useTranslation("animations");
  const state = useAnimationPresentation(engine);
  return (
    <div className="animation-timeline-toggle" role="group" aria-label={t("title")}>
      {[false, true].map((details) => (
        <Button
          key={String(details)}
          size="xs"
          variant={state.details === details ? "secondary" : "ghost"}
          aria-pressed={state.details === details}
          aria-label={t(details ? "advanced" : "simple")}
          onClick={() => {
            if (!details) getMotionAuthoring(engine).set(false);
            animationPresentation(engine).set({ details });
          }}
        >
          {details ? <Diamond size={11} /> : <Sparkles size={11} />}
          <span>{t(details ? "advanced" : "simple")}</span>
        </Button>
      ))}
    </div>
  );
}

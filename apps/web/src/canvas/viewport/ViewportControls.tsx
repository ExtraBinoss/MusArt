import { Crosshair, Minus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";
import type { View } from "./view";
import type { createViewportActions } from "../session/viewport-actions";

export function ViewportControls({
  view,
  actions,
}: {
  view: View;
  actions: ReturnType<typeof createViewportActions>;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="canvas-controls floating-panel" data-canvas-control>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("zoomOut", { defaultValue: "Dézoomer" })}
          onClick={() => actions.run("zoomOut")}
        >
          <Minus size={14} />
        </Button>
        <Button
          variant="ghost"
          className="canvas-zoom"
          aria-label={t("resetView", { defaultValue: "100 % et recentrer" })}
          onClick={() => actions.run("reset")}
        >
          {Math.round(view.zoom * 100)}%
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("zoomIn", { defaultValue: "Zoomer" })}
          onClick={() => actions.run("zoomIn")}
        >
          <Plus size={14} />
        </Button>
      </div>
      {(Math.abs(view.x) > 80 || Math.abs(view.y) > 80) && (
        <Button
          variant="ghost"
          className="canvas-recenter floating-panel"
          data-canvas-control
          onClick={() => actions.run("recenter")}
        >
          <Crosshair size={13} />
          {t("recenterView", { defaultValue: "Recentrer la vue" })}
        </Button>
      )}
    </>
  );
}

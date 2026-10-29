import { PanelBottomOpen, PanelBottomClose, Minus, Plus } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import type { EnginePort } from "@musart/core";
import { useAtom } from "jotai";
import { timelineOpenAtom } from "../../state/motion/timeline-state";
import "../../components/motion/messages";
import { useTranslation } from "react-i18next";
import { IconButton } from "../../components/shared/IconButton";
import { useKeybindings } from "../../state/keybindings/use-keybindings";
import { bindingLabel } from "../../components/search/shortcuts";
import type { View } from "./view";
import type { createViewportActions } from "../session/viewport-actions";

export function ViewportControls({
  view,
  actions,
  motionEnabled = false,
  engine,
}: {
  view: View;
  actions: ReturnType<typeof createViewportActions>;
  motionEnabled?: boolean;
  engine?: EnginePort;
}) {
  const { t } = useTranslation();
  const [timelineOpen, setTimelineOpen] = useAtom(timelineOpenAtom);
  const bindings = useKeybindings();
  const readMode = useCallback(() => {
    if (!engine) return motionEnabled;
    const snapshot = engine.getSnapshot();
    return (
      snapshot.project.pages.find((page) => page.id === snapshot.pageId)?.motion?.mode === "motion"
    );
  }, [engine, motionEnabled]);
  const enabled = useSyncExternalStore(engine?.subscribe ?? subscribeNothing, readMode, readMode);
  return (
    <>
      <div className="canvas-controls floating-panel" data-canvas-control>
        <IconButton
          size="icon"
          label={t("zoomOut", { defaultValue: "Dézoomer" })}
          shortcut={bindingLabel("action:zoomOut", bindings)}
          onClick={() => actions.run("zoomOut")}
        >
          <Minus size={14} />
        </IconButton>
        <IconButton
          className="canvas-zoom"
          label={t("resetView", { defaultValue: "100 % et recentrer" })}
          shortcut={bindingLabel("action:reset", bindings)}
          onClick={() => actions.run("reset")}
        >
          {Math.round(view.zoom * 100)}%
        </IconButton>
        <IconButton
          size="icon"
          label={t("zoomIn", { defaultValue: "Zoomer" })}
          shortcut={bindingLabel("action:zoomIn", bindings)}
          onClick={() => actions.run("zoomIn")}
        >
          <Plus size={14} />
        </IconButton>
      </div>
      {enabled && (
        <IconButton
          className="canvas-timeline-toggle floating-panel"
          label={t("motion:timeline")}
          active={timelineOpen}
          data-canvas-control
          onClick={() => setTimelineOpen((open) => !open)}
        >
          {timelineOpen ? <PanelBottomClose size={17} /> : <PanelBottomOpen size={17} />}
        </IconButton>
      )}
    </>
  );
}
const subscribeNothing = () => () => {};

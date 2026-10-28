import { useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import type { EnginePort } from "@musart/core";
import { IconButton } from "../../components/shared/IconButton";
import { createCommandPort } from "../../state/keybindings/command-port";
import type { SceneController } from "../session/scene-controller";
import "../quick-add/messages";

const idle = { subscribe: () => () => {}, read: () => false };
export function AddArtboardOverlay({
  engine,
  controller,
  onError,
}: {
  engine: EnginePort;
  controller?: SceneController;
  onError?: (message: string) => void;
}) {
  const { t } = useTranslation(),
    commands = useMemo(() => createCommandPort(engine), [engine]);
  const source = useMemo(
    () =>
      controller
        ? { subscribe: controller.subscribe, read: () => Boolean(controller.read().playback) }
        : idle,
    [controller],
  );
  const playback = useSyncExternalStore(source.subscribe, source.read, source.read);
  return (
    <IconButton
      type="button"
      size="icon"
      className="canvas-add-artboard"
      data-testid="canvas-add-artboard"
      data-canvas-control
      disabled={playback}
      label={t("quickAdd:addArtboard")}
      onClick={() => {
        if (!source.read() && !commands.run("action:addPage")) onError?.(t("quickAdd:unavailable"));
      }}
    >
      <Plus size={16} />
    </IconButton>
  );
}

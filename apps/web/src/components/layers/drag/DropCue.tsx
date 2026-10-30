import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { LayerDropPosition } from "../drop-target";
import type { LayerDropRejection } from "./validation";
import { DragCue } from "../../shared/dnd/DragCue";
import "../messages";

export function DropCue({
  anchor,
  position,
  reason,
}: {
  anchor: RefObject<HTMLElement | null>;
  position?: LayerDropPosition;
  reason?: LayerDropRejection;
}) {
  const { t } = useTranslation();
  const message = reason
    ? t(`layerControls:dropRejected.${reason}`)
    : position
      ? t(`layerControls:drop${position[0]!.toUpperCase()}${position.slice(1)}`)
      : "";
  return <DragCue anchor={anchor} position={position} reason={reason} message={message} />;
}

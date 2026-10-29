import { useLayoutEffect, useRef } from "react";
import { Diamond } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  compareMotionTime,
  createLayerGeometryIndex,
  resolveMotionProperty,
  type EnginePort,
  type MotionPropertyTarget,
  type MotionPropertyTrack,
  type MotionTime,
} from "@musart/core";
import { createMotionTransport } from "../../../services/motion/transport";
import { addMotionPropertyKeys, motionPropertyTrack } from "../../../state/session/motion-edit";
import { Button } from "../../ui/button";
import "./messages";
import "./motion-properties.css";

function hasKeyAtTime(property: MotionPropertyTrack | undefined, time: MotionTime): boolean {
  const keys = property?.keyframes ?? [];
  let low = 0,
    high = keys.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1,
      comparison = compareMotionTime(keys[middle]!.time, time);
    if (comparison === 0) return true;
    if (comparison < 0) low = middle + 1;
    else high = middle - 1;
  }
  return false;
}

export function MotionDiamond({
  engine,
  target,
  targets,
  label,
  disabled = false,
}: {
  engine: EnginePort;
  target: MotionPropertyTarget;
  targets?: readonly MotionPropertyTarget[];
  label: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation("motionProperties");
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const transport = createMotionTransport(engine);
    const owner = engine.getSnapshot();
    const addresses = targets ?? [target];
    let cachedPage: ReturnType<EnginePort["getSnapshot"]>["project"]["pages"][number] | undefined;
    let unavailable = false,
      locked = false;
    let properties: (MotionPropertyTrack | undefined)[] = [];
    let lastPresentation = "";
    const update = () => {
      const snapshot = engine.getSnapshot(),
        state = transport.read();
      const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
      if (cachedPage !== page) {
        cachedPage = page;
        unavailable = addresses.some((address) => !resolveMotionProperty(page, address));
        const geometry = createLayerGeometryIndex(page);
        locked = addresses.some(
          (address) =>
            !page.layers.some((layer) => layer.id === address.layerId) ||
            geometry.isLocked(address.layerId),
        );
        properties = addresses.map((address) => motionPropertyTrack(page, address));
      }
      const current =
        properties.length > 0 && properties.every((property) => hasKeyAtTime(property, state.time));
      const animated = properties.some((property) => property?.keyframes.length);
      const node = button.current;
      if (!node) return;
      const hidden = state.mode !== "motion";
      const blocked =
        disabled ||
        unavailable ||
        locked ||
        snapshot.project.id !== owner.project.id ||
        snapshot.pageId !== owner.pageId;
      const presentation = `${hidden}:${blocked}:${animated}:${current}:${unavailable}`;
      if (presentation === lastPresentation) return;
      lastPresentation = presentation;
      node.hidden = hidden;
      node.disabled = blocked;
      node.dataset.animated = String(animated);
      node.dataset.current = String(current);
      node.setAttribute("aria-label", t(current ? "update" : "add", { property: label }));
      node.setAttribute("aria-pressed", String(current));
      node.title = unavailable ? t("macro") : t(animated ? "armed" : "add", { property: label });
    };
    const stop = transport.subscribe(update);
    update();
    return stop;
  }, [engine, target, targets, label, disabled, t]);
  return (
    <Button
      ref={button}
      type="button"
      variant="ghost"
      size="icon-xs"
      className="motion-property-diamond"
      data-motion-diamond
      hidden
      aria-label={t("add", { property: label })}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => addMotionPropertyKeys(engine, targets ?? [target])}
    >
      <Diamond size={11} aria-hidden />
    </Button>
  );
}

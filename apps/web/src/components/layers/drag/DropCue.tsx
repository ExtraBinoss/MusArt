import { useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { LayerDropPosition } from "../drop-target";
import type { LayerDropRejection } from "./validation";
import "../messages";

/** A body portal keeps a native drag's intent above virtual rows and scroll clipping. */
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
  const cue = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    function place() {
      const target = anchor.current,
        node = cue.current;
      if (!target || !node) return;
      const active = target.hasAttribute("data-layer-drop-cue-target");
      node.hidden = !active;
      if (!active) return;
      const bounds = target.getBoundingClientRect();
      node.style.left = `${Math.max(8, Math.min(window.innerWidth - node.offsetWidth - 8, bounds.right - node.offsetWidth))}px`;
      node.style.top = `${Math.max(8, Math.min(window.innerHeight - node.offsetHeight - 8, bounds.top - node.offsetHeight - 4))}px`;
    }
    place();
    const observer = new MutationObserver(place);
    if (anchor.current)
      observer.observe(anchor.current, {
        attributes: true,
        attributeFilter: ["data-layer-drop-cue-target"],
      });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, position, reason]);
  return createPortal(
    <div
      ref={cue}
      hidden
      role="status"
      className="layer-drop-cue"
      data-drop-position={position}
      data-drop-rejected={reason}
    >
      {reason
        ? t(`layerControls:dropRejected.${reason}`)
        : position
          ? t(`layerControls:drop${position[0]!.toUpperCase()}${position.slice(1)}`)
          : null}
    </div>,
    document.body,
  );
}

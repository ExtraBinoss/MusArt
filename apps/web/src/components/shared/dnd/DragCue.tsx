import { useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { readDragCueAnchor, subscribeDragCueAnchor } from "./session";

/** One active anchor across DOM rows, canvas hit proxies and toolbar adapters. */
export function DragCue({
  anchor,
  position,
  reason,
  message,
}: {
  anchor: RefObject<HTMLElement | null>;
  position?: string;
  reason?: string;
  message: string;
}) {
  const active = useSyncExternalStore(subscribeDragCueAnchor, readDragCueAnchor, () => null);
  const cue = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    function place() {
      const original = anchor.current;
      const node = cue.current;
      if (!node) return;
      // Canvas uses one transient hit proxy; its canonical label owns the message.
      const proxyMatches =
        original &&
        active?.hasAttribute("data-timeline-drop-target") &&
        original.dataset.layerDropId === active.dataset.layerDropId &&
        original.dataset.layerDropPageId === active.dataset.layerDropPageId &&
        original.dataset.layerDropKind === active.dataset.layerDropKind &&
        original.dataset.motionRowKey === active.dataset.motionRowKey &&
        original.closest("[data-layer-drag-viewport]") ===
          active.closest("[data-layer-drag-viewport]");
      const target = active === original || proxyMatches ? active : null;
      node.hidden = !target;
      if (!target) return;
      const bounds = target.getBoundingClientRect();
      node.style.left = `${Math.max(8, Math.min(window.innerWidth - node.offsetWidth - 8, bounds.right - node.offsetWidth))}px`;
      node.style.top = `${Math.max(8, Math.min(window.innerHeight - node.offsetHeight - 8, bounds.top - node.offsetHeight - 4))}px`;
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, active, position, reason]);
  return createPortal(
    <div
      ref={cue}
      hidden
      role="status"
      className="layer-drop-cue"
      data-drop-position={position}
      data-drop-rejected={reason}
    >
      {message}
    </div>,
    document.body,
  );
}

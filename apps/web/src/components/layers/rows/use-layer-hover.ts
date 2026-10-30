import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type PointerEvent,
} from "react";
import type { EnginePort } from "@musart/core";
import { createTimelineHoverSource } from "../../../state/motion/hover";

/** Layers and Timeline borrow the same evaluated Canvas outline, without canonical selection. */
export function useLayerHover(engine: EnginePort, compositionId: string, layerId: string) {
  const hover = useMemo(() => createTimelineHoverSource(engine), [engine]);
  const held = useRef<{ node: HTMLElement; release: () => void } | null>(null);
  const clear = useCallback(() => {
    const current = held.current;
    held.current = null;
    if (current) {
      delete current.node.dataset.layerHovered;
      current.release();
    }
  }, []);
  const show = useCallback(
    (node: HTMLElement) => {
      if (
        held.current?.node === node &&
        hover.read()?.compositionId === compositionId &&
        hover.read()?.layerId === layerId
      )
        return;
      const release = hover.show(compositionId, layerId);
      clear();
      node.dataset.layerHovered = "true";
      held.current = { node, release };
    },
    [hover, compositionId, layerId, clear],
  );
  useLayoutEffect(() => clear, [hover, compositionId, layerId, clear]);
  return {
    clear,
    onPointerEnter: (event: PointerEvent<HTMLElement>) => show(event.currentTarget),
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(document.activeElement)) clear();
    },
    onFocus: (event: FocusEvent<HTMLElement>) => show(event.currentTarget),
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clear();
    },
  };
}

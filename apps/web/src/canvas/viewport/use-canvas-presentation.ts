import { useEffect, useLayoutEffect, useMemo, type RefObject } from "react";
import { createLayerGeometryIndex, type Composition } from "@musart/core";
import type { SceneController } from "../session/scene-controller";
import type { WorkspaceSource } from "../artboards/workspace";
import { paintArtboards } from "../artboards/presentation";
import type { ViewMotion } from "./motion";

interface Options {
  controller: SceneController;
  workspace: WorkspaceSource;
  motion: ViewMotion;
  viewport: RefObject<HTMLDivElement | null>;
  beforePaint: () => void;
}
function createPresentation({ controller, workspace, motion, viewport, beforePaint }: Options) {
  let previousPage: Composition | null = null,
    previousZoom = 0,
    previousPlayback: boolean | undefined;
  return (forceGeometry = false) => {
    beforePaint();
    const frame = controller.read(),
      page = frame.page,
      view = motion.read(),
      root = viewport.current;
    if (!root) return;
    paintArtboards(root, workspace.read(), view);
    const artboard = root.querySelector<HTMLElement>('[data-testid="artboard"]');
    if (artboard) {
      artboard.dataset.zoom = String(view.zoom);
      artboard.dataset.panX = String(view.x);
      artboard.dataset.panY = String(view.y);
      artboard.dataset.viewMoving = String(motion.isMoving());
    }
    const label = root.querySelector(".canvas-zoom");
    const zoomLabel = `${Math.round(view.zoom * 100)}%`;
    if (label && label.textContent !== zoomLabel) label.textContent = zoomLabel;
    if (
      !forceGeometry &&
      previousPage === page &&
      previousZoom === view.zoom &&
      previousPlayback === frame.playback
    )
      return;
    previousPage = page;
    previousZoom = view.zoom;
    previousPlayback = frame.playback;
    const index = createLayerGeometryIndex(page);
    for (const overlay of root.querySelectorAll<HTMLElement>(".canvas-selection[data-layer-id]")) {
      const layer = index.byId.get(overlay.dataset.layerId!);
      overlay.style.display = frame.playback || !layer ? "none" : "";
      if (!layer) continue;
      Object.assign(overlay.style, {
        width: `${layer.width}px`,
        height: `${layer.height}px`,
        borderWidth: `${1 / view.zoom}px`,
        transform: `matrix(${index.worldMatrix(layer.id).join(",")})`,
      });
      const size = overlay.querySelector<HTMLElement>(".canvas-selection-size");
      if (size) {
        size.textContent = `${Math.round(layer.width)} × ${Math.round(layer.height)}`;
        size.style.transform = `translateX(-50%) scale(${1 / view.zoom})`;
      }
      for (const handle of overlay.querySelectorAll<HTMLElement>(".canvas-handle"))
        handle.style.transform = `scale(${1 / view.zoom})`;
    }
  };
}
/** Pan updates compositor transforms only; geometry DOM is touched when its scene or zoom changes. */
export function useCanvasPresentation({
  controller,
  workspace,
  motion,
  viewport,
  beforePaint,
}: Options) {
  const paint = useMemo(
    () => createPresentation({ controller, workspace, motion, viewport, beforePaint }),
    [controller, workspace, motion, viewport, beforePaint],
  );
  useLayoutEffect(() => paint(true));
  useEffect(() => {
    const update = () => paint();
    const stopScene = controller.subscribe(update),
      stopView = motion.subscribe(update);
    return () => {
      stopScene();
      stopView();
    };
  }, [controller, motion, paint]);
}

import { memo, useLayoutEffect, useMemo, useRef, type PointerEvent, type RefObject } from "react";
import { createLayerGeometryIndex, type EnginePort } from "@musart/core";
import { useEngineValue } from "../../state/session/editor";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import { GuideOverlay } from "../guides/GuideOverlay";
import { SelectionOverlays } from "./SelectionOverlays";
import { createTimelineHoverSource } from "../../state/motion/hover";

/** Only selection decorations subscribe to selected IDs; the retained canvas stays untouched. */
export const CanvasSelection = memo(function CanvasSelection({
  engine,
  controller,
  viewSource,
  viewport,
  showHandles,
  onHandle,
}: {
  engine: EnginePort;
  controller: SceneController;
  viewSource: ViewSource;
  viewport: RefObject<HTMLDivElement | null>;
  showHandles: boolean;
  onHandle: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  const page = useEngineValue(
    engine,
    (snapshot) =>
      snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
      snapshot.project.pages[0]!,
  );
  const selection = useEngineValue(engine, (snapshot) => snapshot.selection);
  const view = viewSource.read();
  const selected = useMemo(() => {
    const ids = new Set(selection);
    // Keep an evaluated-visible layer's frame available even when its base visibility is off.
    return page.layers.filter((layer) => ids.has(layer.id));
  }, [page, selection]);
  return (
    <>
      <GuideOverlay
        controller={controller}
        engine={engine}
        page={page}
        selected={selection}
        view={view}
        viewSource={viewSource}
        viewport={viewport}
      />
      {showHandles && (
        <SelectionOverlays
          page={page}
          selected={selected}
          zoom={view.zoom}
          controller={controller}
          viewSource={viewSource}
          onHandle={onHandle}
        />
      )}
      <TimelineHoverOutline engine={engine} controller={controller} viewSource={viewSource} />
    </>
  );
});

/** One retained, noninteractive frame follows evaluated artwork without subscribing React to hover. */
function TimelineHoverOutline({
  engine,
  controller,
  viewSource,
}: {
  engine: EnginePort;
  controller: SceneController;
  viewSource: ViewSource;
}) {
  const element = useRef<HTMLDivElement>(null);
  const hover = useMemo(() => createTimelineHoverSource(engine), [engine]);
  useLayoutEffect(() => {
    let previousPage: unknown = null,
      previousTarget: unknown = null,
      previousZoom = 0,
      previousPlayback: boolean | undefined;
    const paint = () => {
      const node = element.current,
        target = hover.read(),
        frame = controller.read(),
        scale = viewSource.read().zoom;
      if (
        !node ||
        (previousPage === frame.page &&
          previousTarget === target &&
          previousZoom === scale &&
          previousPlayback === frame.playback)
      )
        return;
      previousPage = frame.page;
      previousTarget = target;
      previousZoom = scale;
      previousPlayback = frame.playback;
      if (
        !target ||
        target.projectId !== engine.getSnapshot().project.id ||
        target.compositionId !== frame.page.id
      ) {
        if (node.style.display !== "none") node.style.display = "none";
        delete node.dataset.layerId;
        return;
      }
      const index = createLayerGeometryIndex(frame.page);
      const layer = index.byId.get(target.layerId);
      const visible = layer && index.isVisible(layer.id) && !layer.maskSource;
      node.style.display = visible ? "" : "none";
      if (!visible || !layer) {
        delete node.dataset.layerId;
        return;
      }
      node.dataset.layerId = layer.id;
      node.dataset.playback = String(Boolean(frame.playback));
      Object.assign(node.style, {
        width: `${layer.width}px`,
        height: `${layer.height}px`,
        borderWidth: `${1 / scale}px`,
        transform: `matrix(${index.worldMatrix(layer.id).join(",")})`,
        opacity: frame.playback ? ".2" : "1",
      });
      for (const handle of node.querySelectorAll<HTMLElement>(".canvas-timeline-hover-handle"))
        handle.style.transform = `scale(${1 / scale})`;
    };
    paint();
    const stopHover = hover.subscribe(paint),
      stopScene = controller.subscribe(paint),
      stopView = viewSource.subscribe(paint);
    return () => {
      stopHover();
      stopScene();
      stopView();
    };
  }, [controller, engine, hover, viewSource]);
  return (
    <div
      ref={element}
      className="canvas-timeline-hover"
      aria-hidden="true"
      style={{ display: "none" }}
    >
      {(["nw", "ne", "sw", "se"] as const).map((corner) => (
        <span key={corner} className={`canvas-timeline-hover-handle is-${corner}`} />
      ))}
    </div>
  );
}

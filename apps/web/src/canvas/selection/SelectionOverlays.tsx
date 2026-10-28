import { useLayoutEffect, useRef, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { createLayerGeometryIndex, type Composition, type Layer } from "@musart/core";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";

interface Props {
  page: Composition;
  selected: Layer[];
  zoom: number;
  controller: SceneController;
  viewSource: ViewSource;
  onHandle: (event: PointerEvent<HTMLButtonElement>) => void;
}
const MAX_INDIVIDUAL_FRAMES = 64;
function CollectiveFrame({
  selected,
  controller,
  viewSource,
  zoom,
}: Omit<Props, "page" | "onHandle">) {
  const frame = useRef<HTMLDivElement>(null),
    { t } = useTranslation();
  useLayoutEffect(() => {
    let previous: Composition | null = null,
      previousZoom = 0,
      previousPlayback: boolean | undefined;
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    const paint = () => {
      const current = controller.read(),
        scale = viewSource.read().zoom;
      if (
        previous === current.page &&
        previousZoom === scale &&
        previousPlayback === current.playback
      )
        return;
      const element = frame.current;
      if (!element) return;
      if (previous !== current.page) {
        const index = createLayerGeometryIndex(current.page);
        const bounds = index.collectiveBounds(selected.map((layer) => layer.id));
        left = bounds?.x ?? Infinity;
        top = bounds?.y ?? Infinity;
        right = bounds ? bounds.x + bounds.width : -Infinity;
        bottom = bounds ? bounds.y + bounds.height : -Infinity;
      }
      previous = current.page;
      previousZoom = scale;
      previousPlayback = current.playback;
      element.style.display = current.playback || !Number.isFinite(left) ? "none" : "";
      if (!Number.isFinite(left)) return;
      Object.assign(element.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${right - left}px`,
        height: `${bottom - top}px`,
        borderWidth: `${1 / scale}px`,
      });
      const label = element.querySelector<HTMLElement>(".canvas-selection-size");
      if (label) label.style.transform = `translateX(-50%) scale(${1 / scale})`;
    };
    paint();
    const stopScene = controller.subscribe(paint),
      stopView = viewSource.subscribe(paint);
    return () => {
      stopScene();
      stopView();
    };
  }, [selected, controller, viewSource]);
  return (
    <div
      ref={frame}
      className="canvas-selection canvas-selection-collective"
      data-selection-count={selected.length}
      aria-label={t("selectedCount", { count: selected.length })}
    >
      <span
        className="canvas-selection-size"
        style={{ transform: `translateX(-50%) scale(${1 / zoom})`, transformOrigin: "top center" }}
      >
        {t("selectedCount", { count: selected.length })}
      </span>
    </div>
  );
}

export function SelectionOverlays({
  page,
  selected,
  zoom,
  controller,
  viewSource,
  onHandle,
}: Props) {
  const { t } = useTranslation();
  const index = createLayerGeometryIndex(page);
  return (
    <div className="canvas-selection-overlays" data-selection-size={selected.length}>
      {selected.length > MAX_INDIVIDUAL_FRAMES ? (
        <CollectiveFrame
          selected={selected}
          zoom={zoom}
          controller={controller}
          viewSource={viewSource}
        />
      ) : (
        selected.map((layer) => (
          <div
            key={layer.id}
            className="canvas-selection"
            data-layer-id={layer.id}
            style={{
              width: layer.width,
              height: layer.height,
              transform: `matrix(${index.worldMatrix(layer.id).join(",")})`,
              borderWidth: 1 / zoom,
            }}
          >
            {!layer.locked &&
              !index.ancestors(layer.id).some((parent) => parent.locked) &&
              (["nw", "ne", "sw", "se", "rotate"] as const).map((handle) => (
                <button
                  type="button"
                  key={handle}
                  className={`canvas-handle canvas-handle-${handle}`}
                  aria-label={`${handle === "rotate" ? t("rotate", { defaultValue: "Tourner" }) : t("resize", { defaultValue: "Redimensionner" })} ${layer.name} ${handle}`}
                  style={{ transform: `scale(${1 / zoom})` }}
                  data-layer-id={layer.id}
                  data-handle={handle}
                  onPointerDown={onHandle}
                />
              ))}
            {selected.length === 1 && (
              <span
                className="canvas-selection-size"
                style={{
                  transform: `translateX(-50%) scale(${1 / zoom})`,
                  transformOrigin: "top center",
                }}
              >
                {Math.round(layer.width)} × {Math.round(layer.height)}
              </span>
            )}
          </div>
        ))
      )}
    </div>
  );
}

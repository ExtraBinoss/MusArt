import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
  type CSSProperties,
} from "react";
import { DEFAULT_GUIDE_COLOR } from "../../state/guides/colors";
import {
  createLayerGeometryIndex,
  invertMatrix,
  transformPoint,
  type Composition,
  type EnginePort,
  type Guide,
  type Layer,
} from "@musart/core";
import type { SceneController } from "../session/scene-controller";
import { clientToPage, type View } from "../viewport/view";
import type { ViewSource } from "../viewport/motion";
import {
  captureGestureOrigin,
  isGestureOriginCurrent,
  type GestureOrigin,
} from "../interaction/gesture-origin";

function labelTransform(page: Composition, layer: Layer | undefined, zoom: number): string {
  const matrix = layer ? createLayerGeometryIndex(page).worldMatrix(layer.id) : [1, 0];
  const angle = (Math.atan2(matrix[1]!, matrix[0]!) * 180) / Math.PI;
  return `rotate(${-angle}deg) scale(${1 / zoom})`;
}

export function GuideOverlay({
  engine,
  page,
  selected,
  view,
  viewport,
  controller,
  viewSource,
}: {
  viewSource?: ViewSource;
  controller?: SceneController;
  engine: EnginePort;
  page: Composition;
  selected: string[];
  view: View;
  viewport: RefObject<HTMLDivElement | null>;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  const selectedGeometry =
    selected.length > 0 && selected.length <= 64 ? createLayerGeometryIndex(page) : null;
  const guideOwners = selectedGeometry
    ? selected.flatMap((id) => {
        const layer = selectedGeometry.byId.get(id);
        return layer?.guides?.length && selectedGeometry.isVisible(id) ? [layer] : [];
      })
    : [];
  const active = useRef<{
    guide: Guide;
    layer?: Layer;
    origin: GestureOrigin;
    handle: HTMLDivElement;
    pointerId: number;
  } | null>(null);
  const [draft, setDraft] = useState<{ id: string; layerId?: string; position: number } | null>(
    null,
  );
  useEffect(() => {
    const clear = () => {
      const current = active.current;
      active.current = null;
      if (current?.handle.hasPointerCapture(current.pointerId))
        current.handle.releasePointerCapture(current.pointerId);
      if (current) setDraft(null);
    };
    const changed = () => {
      if (
        active.current &&
        (!isGestureOriginCurrent(engine, active.current.origin) || controller?.read().playback)
      )
        clear();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !active.current) return;
      event.preventDefault();
      event.stopPropagation();
      clear();
    };
    window.addEventListener("keydown", key, true);
    const stopEngine = engine.subscribe(changed),
      stopScene = controller?.subscribe(changed);
    return () => {
      stopEngine();
      stopScene?.();
      window.removeEventListener("keydown", key, true);
      clear();
    };
  }, [engine, controller]);
  useEffect(() => {
    if (!controller && !viewSource) return;
    let previousPage: Composition | null = null,
      previousZoom = 0,
      previousPlayback: boolean | undefined;
    const paint = () => {
      const frame = controller?.read();
      const current = frame?.page ?? page;
      const zoom = viewSource?.read().zoom ?? view.zoom;
      if (previousPage === current && previousZoom === zoom && previousPlayback === frame?.playback)
        return;
      previousPage = current;
      previousZoom = zoom;
      previousPlayback = frame?.playback;
      if (!overlay.current) return;
      overlay.current.style.display = frame?.playback ? "none" : "";
      const groups = overlay.current.querySelectorAll<HTMLElement>(".layer-guides");
      const index = groups.length ? createLayerGeometryIndex(current) : null;
      for (const group of groups) {
        const layer = index?.byId.get(group.dataset.layerId!);
        if (layer) group.style.transform = `matrix(${index!.worldMatrix(layer.id).join(",")})`;
      }
      for (const line of overlay.current.querySelectorAll<HTMLElement>("[data-guide-id]")) {
        const layer = line.dataset.guideLayer
          ? index?.byId.get(line.dataset.guideLayer)
          : undefined;
        const guide = (layer?.guides ?? current.guides).find(
          (item) => item.id === line.dataset.guideId,
        );
        if (!guide) continue;
        line.style.setProperty("--guide-color", guide.color ?? DEFAULT_GUIDE_COLOR);
        const horizontal = guide.axis === "y";
        line.style.left = `${horizontal ? 0 : guide.position}px`;
        line.style.top = `${horizontal ? guide.position : 0}px`;
        line.style.width = `${horizontal ? (layer?.width ?? current.width) : 8 / zoom}px`;
        line.style.height = `${horizontal ? 8 / zoom : (layer?.height ?? current.height)}px`;
        const label = line.querySelector("span");
        if (label) {
          label.textContent = `${guide.axis.toUpperCase()} ${Math.round(guide.position)} px`;
          label.style.transform = labelTransform(current, layer, zoom);
        }
      }
    };
    paint();
    const stopScene = controller?.subscribe(paint),
      stopView = viewSource?.subscribe(paint);
    return () => {
      stopScene?.();
      stopView?.();
    };
  }, [controller, view.zoom, page, viewSource]);
  function point(event: PointerEvent) {
    const world = clientToPage(
      { x: event.clientX, y: event.clientY },
      viewport.current!.getBoundingClientRect(),
      viewSource?.read() ?? view,
      page,
    );
    return active.current?.layer
      ? transformPoint(
          invertMatrix(createLayerGeometryIndex(page).worldMatrix(active.current.layer.id)),
          world,
        )
      : world;
  }
  function start(event: PointerEvent<HTMLDivElement>, guide: Guide, layer?: Layer) {
    if (event.button !== 0 || controller?.read().playback) return;
    event.preventDefault();
    event.stopPropagation();
    active.current = {
      guide,
      layer,
      origin: captureGestureOrigin(engine),
      handle: event.currentTarget,
      pointerId: event.pointerId,
    };
    setDraft({ id: guide.id, layerId: layer?.id, position: guide.position });
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function end(event: PointerEvent<HTMLDivElement>, cancel = false) {
    const gesture = active.current;
    if (!gesture) return;
    if (!cancel && isGestureOriginCurrent(engine, gesture.origin)) {
      const value = Math.round(point(event)[gesture.guide.axis] * 100) / 100;
      const extent =
        gesture.guide.axis === "x"
          ? (gesture.layer?.width ?? page.width)
          : (gesture.layer?.height ?? page.height);
      const target = gesture.layer ? { targetId: gesture.layer.id } : {};
      if (value < 0 || value > extent)
        engine.execute({ type: "deleteGuide", id: gesture.guide.id, ...target });
      else if (value !== gesture.guide.position)
        engine.execute({
          type: "updateGuide",
          id: gesture.guide.id,
          patch: { position: value },
          ...target,
        });
    }
    active.current = null;
    setDraft(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function line(guide: Guide, layer?: Layer) {
    const position =
      draft?.id === guide.id && draft.layerId === layer?.id ? draft.position : guide.position;
    return (
      <div
        key={`${layer?.id ?? "page"}:${guide.id}`}
        className={`canvas-guide-hit guide-${guide.axis}`}
        data-canvas-control
        data-guide-id={guide.id}
        data-guide-layer={layer?.id}
        data-dragging={draft?.id === guide.id && draft.layerId === layer?.id ? "true" : undefined}
        style={
          {
            "--guide-color": guide.color ?? DEFAULT_GUIDE_COLOR,
            ...(guide.axis === "x"
              ? {
                  left: position,
                  top: 0,
                  height: layer?.height ?? page.height,
                  width: 8 / view.zoom,
                }
              : {
                  top: position,
                  left: 0,
                  width: layer?.width ?? page.width,
                  height: 8 / view.zoom,
                }),
          } as CSSProperties
        }
        onPointerDown={(event) => start(event, guide, layer)}
        onPointerMove={(event) => {
          if (active.current && !isGestureOriginCurrent(engine, active.current.origin))
            end(event, true);
          else if (active.current)
            setDraft({
              id: active.current.guide.id,
              layerId: active.current.layer?.id,
              position: point(event)[guide.axis],
            });
        }}
        onPointerUp={end}
        onPointerCancel={(event) => end(event, true)}
        onLostPointerCapture={(event) => end(event, true)}
      >
        <span style={{ transform: labelTransform(page, layer, view.zoom) }}>
          {guide.axis.toUpperCase()} {Math.round(position)} px
        </span>
      </div>
    );
  }
  return (
    <div className="canvas-guides-overlay" ref={overlay}>
      {page.guides.map((guide) => line(guide))}
      {guideOwners.map((layer) => (
        <div
          key={layer.id}
          className="layer-guides"
          data-layer-id={layer.id}
          style={{
            transform: `matrix(${createLayerGeometryIndex(page).worldMatrix(layer.id).join(",")})`,
          }}
        >
          {layer.guides!.map((guide) => line(guide, layer))}
        </div>
      ))}
    </div>
  );
}

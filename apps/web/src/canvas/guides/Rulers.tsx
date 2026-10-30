import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
  type CSSProperties,
} from "react";
import { guideColors } from "../../state/guides/colors";
import { useTranslation } from "react-i18next";
import { createId, type Composition, type EnginePort } from "@musart/core";
import { clientToPage, type View } from "../viewport/view";
import { RulerPresentation } from "./ruler-presentation";
import type { ViewSource } from "../viewport/motion";
import type { SceneController } from "../session/scene-controller";
import {
  captureGestureOrigin,
  isGestureOriginCurrent,
  type GestureOrigin,
} from "../interaction/gesture-origin";
import { registerFeatureTranslations } from "../../state/i18n/feature-resources";
import "./guides.css";
registerFeatureTranslations("guides", {
  en: {
    horizontal: "Horizontal ruler: drag to add a horizontal guide",
    vertical: "Vertical ruler: drag to add a vertical guide",
  },
  fr: {
    horizontal: "Règle horizontale : glisser pour ajouter un repère horizontal",
    vertical: "Règle verticale : glisser pour ajouter un repère vertical",
  },
});

export function Rulers({
  engine,
  page,
  view,
  viewport,
  viewSource,
  controller,
}: {
  viewSource?: ViewSource;
  controller?: SceneController;
  engine: EnginePort;
  page: Composition;
  view: View;
  viewport: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation("guides");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<{ axis: "x" | "y"; position: number; color: string } | null>(
    null,
  );
  const active = useRef<{
    axis: "x" | "y";
    origin: GestureOrigin;
    handle: SVGSVGElement;
    pointerId: number;
    color: string;
  } | null>(null);
  const rulers = useRef<HTMLDivElement>(null);
  const presentations = useRef(new Map<SVGGElement, RulerPresentation>());
  useEffect(() => {
    if (!page.rulers) return;
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
  }, [engine, controller, page.rulers]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () => {
      const rect = element.getBoundingClientRect();
      setSize((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const frame = requestAnimationFrame(resize);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [viewport]);
  useEffect(() => {
    const retained = presentations.current;
    if (!page.rulers) return;
    const paint = () => {
      const current = viewSource?.read() ?? view;
      const currentPage = controller?.read().page ?? page;
      for (const axis of ["x", "y"] as const) {
        const root = rulers.current?.querySelector<SVGGElement>(`.ruler-${axis} svg > g`);
        if (!root) continue;
        const extent = axis === "x" ? size.width : size.height;
        const origin =
          extent / 2 +
          current[axis] -
          ((axis === "x" ? currentPage.width : currentPage.height) * current.zoom) / 2;
        let presentation = retained.get(root);
        if (!presentation) {
          presentation = new RulerPresentation(
            root,
            axis,
            root.closest<HTMLElement>(".ruler-strip")!,
          );
          retained.set(root, presentation);
        }
        presentation.paint(extent, origin, current.zoom);
      }
    };
    paint();
    const stopView = viewSource?.subscribe(paint),
      stopScene = controller?.subscribe(paint);
    return () => {
      stopView?.();
      stopScene?.();
    };
  }, [page, size.width, size.height, view, viewSource, controller]);
  function move(event: PointerEvent<SVGSVGElement>) {
    if (!active.current || !viewport.current) return;
    if (!isGestureOriginCurrent(engine, active.current.origin)) {
      end(event, true);
      return;
    }
    const point = clientToPage(
      { x: event.clientX, y: event.clientY },
      viewport.current.getBoundingClientRect(),
      viewSource?.read() ?? view,
      controller?.read().page ?? page,
    );
    setDraft({
      axis: active.current.axis,
      position: point[active.current.axis],
      color: active.current.color,
    });
  }
  function begin(event: PointerEvent<SVGSVGElement>, axis: "x" | "y") {
    if (!page.rulers || event.button !== 0 || controller?.read().playback) return;
    event.preventDefault();
    event.stopPropagation();
    active.current = {
      axis,
      origin: captureGestureOrigin(engine),
      handle: event.currentTarget,
      pointerId: event.pointerId,
      color: guideColors.read(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    move(event);
  }
  function end(event: PointerEvent<SVGSVGElement>, cancel = false) {
    const current = active.current;
    if (!current) return;
    active.current = null;
    if (!cancel && isGestureOriginCurrent(engine, current.origin) && viewport.current) {
      const currentPage = controller?.read().page ?? page;
      const point = clientToPage(
        { x: event.clientX, y: event.clientY },
        viewport.current.getBoundingClientRect(),
        viewSource?.read() ?? view,
        currentPage,
      );
      const position = Math.round(point[current.axis] * 100) / 100;
      if (
        position >= 0 &&
        position <= (current.axis === "x" ? currentPage.width : currentPage.height)
      )
        engine.execute({
          type: "addGuide",
          guide: { id: createId(), axis: current.axis, position, color: current.color },
        });
    }
    setDraft(null);
    if (current.handle.hasPointerCapture(current.pointerId))
      current.handle.releasePointerCapture(current.pointerId);
  }
  const originX = size.width / 2 + view.x - (page.width * view.zoom) / 2;
  const originY = size.height / 2 + view.y - (page.height * view.zoom) / 2;
  return (
    <div className="canvas-rulers" data-canvas-control hidden={!page.rulers} ref={rulers}>
      <div className="ruler-corner" />
      {(["x", "y"] as const).map((axis) => (
        <div key={axis} className={`canvas-ruler ruler-${axis}`}>
          <div className="ruler-strip">
            <svg
              aria-label={t(axis === "x" ? "horizontal" : "vertical")}
              onPointerDown={(event) => begin(event, axis === "x" ? "y" : "x")}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={(event) => end(event, true)}
              onLostPointerCapture={(event) => end(event, true)}
            >
              <g />
            </svg>
          </div>
        </div>
      ))}
      {draft && (
        <div
          className={`ruler-guide-preview guide-${draft.axis}`}
          style={
            {
              "--guide-color": draft.color,
              ...(draft.axis === "x"
                ? { left: originX + draft.position * view.zoom }
                : { top: originY + draft.position * view.zoom }),
            } as CSSProperties & { "--guide-color": string }
          }
        >
          <span>{Math.round(draft.position)} px</span>
        </div>
      )}
    </div>
  );
}

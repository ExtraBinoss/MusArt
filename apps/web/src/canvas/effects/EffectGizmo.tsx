import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type PointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  transformPoint,
  type Composition,
  type Layer,
  type EnginePort,
  type Effect,
} from "@musart/core";
import { attachmentSelection } from "../../state/selection/attachments";
import { useLayerPreview } from "../../components/layers/controls/use-layer-preview";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import { moveRadialHandle, radialGeometry, type RadialHandle } from "./radial-geometry";
import "./messages";
import "./gizmo.css";

interface Gesture {
  pointerId?: number;
  keys: Set<string>;
  handle: RadialHandle;
  page: Composition;
  layer: Layer;
  effect: Effect;
  next: Effect;
}
interface Props {
  engine: EnginePort;
  controller: SceneController;
  viewSource: ViewSource;
  onError?: (message: string) => void;
}
/** Only attachment intent uses React. Continuous positions paint through imperative ports. */
export function EffectGizmo(props: Props) {
  const selection = useMemo(() => attachmentSelection(props.engine), [props.engine]);
  const target = useSyncExternalStore(selection.subscribe, selection.read, selection.read);
  if (target?.kind !== "effect" || !selection.editable()) return null;
  const snapshot = props.engine.getSnapshot(),
    page = snapshot.project.pages.find((p) => p.id === target.pageId)!;
  const layer = page.layers.find((item) => item.id === target.layerId);
  const effect = layer?.effects.find((item) => item.id === target.effectId);
  if (!layer || !effect || !radialGeometry(page, layer, effect)) return null;
  return (
    <RadialGizmo
      key={`${target.pageId}:${target.layerId}:${target.effectId}`}
      {...props}
      layerId={layer.id}
      effect={effect}
    />
  );
}

function RadialGizmo({
  engine,
  controller,
  viewSource,
  onError,
  layerId,
  effect,
}: Props & { layerId: string; effect: Effect }) {
  const { t } = useTranslation();
  const root = useRef<SVGSVGElement>(null);
  const held = useRef<Gesture | null>(null);
  const page = engine
    .getSnapshot()
    .project.pages.find((p) => p.id === engine.getSnapshot().pageId)!;
  const preview = useLayerPreview(
    engine,
    page,
    [layerId],
    (task) => {
      try {
        task();
      } catch (error) {
        onError?.(error instanceof Error ? error.message : String(error));
      }
    },
    true,
  );
  const release = useCallback((gesture: Gesture | null) => {
    if (gesture?.pointerId !== undefined && root.current?.hasPointerCapture(gesture.pointerId))
      root.current.releasePointerCapture(gesture.pointerId);
  }, []);
  const cancelPreview = preview.cancel;
  const cancel = useCallback(() => {
    const gesture = held.current;
    held.current = null;
    cancelPreview();
    release(gesture);
  }, [cancelPreview, release]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [cancel]);
  const finish = () => {
    const gesture = held.current;
    if (!gesture) return;
    held.current = null;
    preview.commit({
      effects: gesture.layer.effects.map((item) =>
        item.id === gesture.effect.id ? gesture.next : item,
      ),
    });
    release(gesture);
  };
  function begin(handle: RadialHandle, pointerId?: number) {
    if (held.current || controller.read().playback || !attachmentSelection(engine).editable())
      return null;
    // An earlier capture listener may just have frozen live playback. Capture the
    // resulting canonical page and phase, instead of the previous render's props.
    const snapshot = engine.getSnapshot();
    const currentPage = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
    const currentLayer = currentPage.layers.find((item) => item.id === layerId);
    const currentEffect = currentLayer?.effects.find((item) => item.id === effect.id);
    if (!currentLayer || !currentEffect) return null;
    preview.beginOnPage(currentPage);
    const gesture: Gesture = {
      pointerId,
      keys: new Set(),
      handle,
      page: currentPage,
      layer: currentLayer,
      effect: currentEffect,
      next: currentEffect,
    };
    held.current = gesture;
    return gesture;
  }
  function publish(gesture: Gesture) {
    preview.preview({
      effects: gesture.layer.effects.map((item) =>
        item.id === gesture.effect.id ? gesture.next : item,
      ),
    });
  }
  useLayoutEffect(() => {
    const paint = () => {
      const svg = root.current,
        frame = controller.read();
      if (!svg) return;
      const owner = frame.page.layers.find((item) => item.id === layerId);
      const current = owner?.effects.find((item) => item.id === effect.id);
      const geometry = owner && current && radialGeometry(frame.page, owner, current);
      svg.style.display = !geometry || frame.playback ? "none" : "";
      if (!geometry) return;
      const scale = viewSource.read().zoom;
      const g = svg.querySelector<SVGGElement>(".effect-gizmo-owner")!;
      g.setAttribute("transform", `matrix(${geometry.matrix.join(" ")})`);
      const area = svg.querySelector<SVGGElement>(".effect-gizmo-area")!;
      area.setAttribute(
        "transform",
        `translate(${geometry.x} ${geometry.y}) rotate(${geometry.rotation})`,
      );
      for (const handle of ["radius", "innerRadius"] as const) {
        const radius = geometry[handle],
          ellipse = svg.querySelector<SVGEllipseElement>(`[data-ring="${handle}"]`)!;
        ellipse.style.display = radius === null ? "none" : "";
        ellipse.setAttribute("rx", String((radius ?? 0) * geometry.aspect));
        ellipse.setAttribute("ry", String(radius ?? 0));
        ellipse.setAttribute("stroke-width", String(1 / scale));
        const button = svg.querySelector<SVGCircleElement>(`[data-handle="${handle}"]`)!;
        button.style.display = radius === null ? "none" : "";
        button.setAttribute("cx", String((radius ?? 0) * geometry.aspect));
      }
      for (const button of svg.querySelectorAll<SVGCircleElement>("[data-handle]")) {
        button.setAttribute("r", String(6 / scale));
        button.setAttribute("stroke-width", String(1.5 / scale));
      }
    };
    paint();
    const stopScene = controller.subscribe(paint),
      stopView = viewSource.subscribe(paint);
    return () => {
      stopScene();
      stopView();
      const gesture = held.current;
      held.current = null;
      release(gesture);
    };
  }, [controller, viewSource, effect.id, layerId, release]);
  function point(event: { clientX: number; clientY: number }, targetPage: Composition) {
    const rect = root.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * targetPage.width) / rect.width,
      y: ((event.clientY - rect.top) * targetPage.height) / rect.height,
    };
  }
  function update(event: PointerEvent<SVGSVGElement>) {
    const gesture = held.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const next = moveRadialHandle(
      gesture.page,
      gesture.layer,
      gesture.effect,
      gesture.handle,
      point(event, gesture.page),
    );
    const updated = { ...gesture, next };
    held.current = updated;
    publish(updated);
  }
  function nudge(handle: RadialHandle, key: string, shift: boolean) {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[key];
    if (!direction || held.current?.pointerId !== undefined) return false;
    const gesture = held.current ?? begin(handle);
    if (!gesture || gesture.handle !== handle) return false;
    const geometry = radialGeometry(gesture.page, gesture.layer, gesture.next)!;
    const step = shift ? 10 : 1;
    let local = { x: geometry.x + direction[0] * step, y: geometry.y + direction[1] * step };
    if (handle !== "center") {
      const radius = Math.max(0, (geometry[handle] ?? 0) + (direction[0] - direction[1]) * step);
      const angle = (geometry.rotation * Math.PI) / 180;
      local = {
        x: geometry.x + radius * geometry.aspect * Math.cos(angle),
        y: geometry.y + radius * geometry.aspect * Math.sin(angle),
      };
    }
    const keys = new Set(gesture.keys);
    keys.add(key);
    const next = moveRadialHandle(
      gesture.page,
      gesture.layer,
      gesture.next,
      handle,
      transformPoint(geometry.matrix, local),
    );
    const updated = { ...gesture, keys, next };
    held.current = updated;
    publish(updated);
    return true;
  }
  function nearestHandle(event: PointerEvent<SVGCircleElement>) {
    let nearest = event.currentTarget,
      distance = Infinity;
    // Small protected radii can overlap the center's fixed screen-size hit area.
    // Resolve by screen-space distance instead of SVG painting order. Center wins
    // exact ties; all handles remain independently keyboard accessible.
    for (const handle of ["center", "innerRadius", "radius"] as const) {
      const button = root.current!.querySelector<SVGCircleElement>(`[data-handle="${handle}"]`)!;
      if (button.style.display === "none") continue;
      const rect = button.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const next = Math.hypot(
        event.clientX - (rect.left + rect.width / 2),
        event.clientY - (rect.top + rect.height / 2),
      );
      if (next < distance) {
        nearest = button;
        distance = next;
      }
    }
    return nearest;
  }
  return (
    <svg
      ref={root}
      className="effect-gizmo"
      aria-label={t("effectGizmo:hint")}
      onPointerMove={(event) => {
        if (held.current) {
          event.stopPropagation();
          update(event);
        }
      }}
      onPointerUp={(event) => {
        const gesture = held.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        event.stopPropagation();
        update(event);
        finish();
      }}
      onPointerCancel={(event) => {
        if (held.current?.pointerId === event.pointerId) cancel();
      }}
      onLostPointerCapture={(event) => {
        if (held.current?.pointerId === event.pointerId) cancel();
      }}
      onKeyUp={(event) => {
        const gesture = held.current;
        if (!gesture || gesture.pointerId !== undefined || !gesture.keys.has(event.key)) return;
        const keys = new Set(gesture.keys);
        keys.delete(event.key);
        held.current = { ...gesture, keys };
        event.preventDefault();
        event.stopPropagation();
        if (keys.size === 0) finish();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        }
      }}
    >
      <g className="effect-gizmo-owner">
        <g className="effect-gizmo-area">
          <ellipse data-ring="radius" className="effect-gizmo-ring" />
          <ellipse data-ring="innerRadius" className="effect-gizmo-ring effect-gizmo-inner" />
          {(["radius", "innerRadius", "center"] as const).map((handle) => (
            <circle
              key={handle}
              data-handle={handle}
              data-canvas-control
              role="button"
              tabIndex={0}
              aria-label={t(`effectGizmo:${handle}`)}
              className="effect-gizmo-handle"
              onKeyDown={(event) => {
                if (nudge(handle, event.key, event.shiftKey)) {
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
              onBlur={() => {
                if (held.current && held.current.pointerId === undefined) finish();
              }}
              onPointerDown={(event) => {
                if (event.button !== 0 || held.current || controller.read().playback) return;
                event.preventDefault();
                event.stopPropagation();
                const button = nearestHandle(event);
                button.focus();
                if (begin(button.dataset.handle as RadialHandle, event.pointerId))
                  root.current!.setPointerCapture(event.pointerId);
              }}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}

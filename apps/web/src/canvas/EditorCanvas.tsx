import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useStore } from "jotai";
import type { FontResolver } from "@musart/render";
import { shapeChoiceAtom } from "../components/assets/selection";
import { createArtworkLayer } from "./interaction/shapes";
import { completeDrawing, resizeDrawing } from "./interaction/drawing";
import { useTranslation } from "react-i18next";
import {
  createLayer,
  createLayerGeometryIndex,
  invertMatrix,
  transformPoint,
  type EnginePort,
  type Layer,
} from "@musart/core";
import { EditorScene } from "./render/EditorScene";
import { SceneController } from "./session/scene-controller";
import { createCanvasView } from "./session/view-state";
import { useRenderMetrics } from "../state/session/render-metrics";
import { EMPTY_PREVIEW_SOURCE, type PreviewSource } from "../state/session/preview-source";
import {
  boxSelection,
  movePatches,
  patchesToCommands,
  resizePatch,
  selectedRoots,
  type Handle,
  type LayerPatch,
  type Tool,
} from "./interaction/gestures";
import { clientToPage, type Point, type View } from "./viewport/view";
import { useViewport } from "./viewport/use-viewport";
import { ViewportControls } from "./viewport/ViewportControls";
import { createWorkspace, createArtboardView } from "./artboards/workspace";
import { artboardAt, viewForArtboard } from "./artboards/layout";
import { artboardStyle } from "./artboards/presentation";
import { ArtboardHeadings } from "./artboards/ArtboardHeadings";
import { InactiveArtboards } from "./artboards/InactiveArtboards";
import type { ArtboardServices } from "./artboards/use-previews";
import {
  captureGestureOrigin,
  isGestureOriginCurrent,
  type GestureOrigin,
} from "./interaction/gesture-origin";
import "./artboards/artboards.css";
import { QuickAdd } from "./quick-add/QuickAdd";
import { SelectionOverlays } from "./selection/SelectionOverlays";
import { useCanvasPresentation } from "./viewport/use-canvas-presentation";
import { Rulers } from "./guides/Rulers";
import { GuideOverlay } from "./guides/GuideOverlay";
import { Measurements } from "./guides/Measurements";
import "./canvas.css";
export type { Tool } from "./interaction/gestures";

export interface EditorCanvasProps {
  fontResolver?: FontResolver;
  services?: ArtboardServices;
  engine: EnginePort;
  tool: Tool;
  previewSource?: PreviewSource;
  onError?: (message: string) => void;
  onDropFiles?: (files: File[]) => void;
  onImagePoint?: (layerId: string, x: number, y: number) => void;
}
interface Gesture {
  origin: GestureOrigin;
  mode: "pan" | "move" | "resize" | "box" | "draw";
  from: Point;
  client: Point;
  view: View;
  layers: Layer[];
  handle?: Handle;
  shape?: Layer;
  current: Point;
}

export function EditorCanvas({
  engine,
  tool,
  previewSource = EMPTY_PREVIEW_SOURCE,
  onError,
  onDropFiles,
  onImagePoint,
  fontResolver,
  services,
}: EditorCanvasProps) {
  const { t } = useTranslation();
  const store = useStore();
  const viewSource = useMemo(() => createCanvasView(engine), [engine]);
  const snapshot = useSyncExternalStore(viewSource.subscribe, viewSource.read, viewSource.read);
  const controller = useMemo(
    () => new SceneController(engine, previewSource),
    [engine, previewSource],
  );
  const page =
    snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
    snapshot.project.pages[0]!;
  const workspace = useMemo(() => createWorkspace(engine, controller), [engine, controller]);
  const layout = workspace.read();
  const layoutKey = JSON.stringify(
    snapshot.project.pages.map((item) => [item.id, item.width, item.height]),
  );
  const viewport = useRef<HTMLDivElement>(null);
  useRenderMetrics(viewport);
  const {
    view,
    viewRef,
    motion,
    actions: viewportActions,
  } = useViewport({ engine, workspace, viewport, layoutKey, projectId: snapshot.project.id });
  const pageViewSource = useMemo(() => createArtboardView(workspace, motion), [workspace, motion]);
  const activeBoard = layout.boards.find((board) => board.id === page.id)!;
  const shown = motion.read();
  const pageView = viewForArtboard(shown, layout, activeBoard);
  const gesture = useRef<Gesture | null>(null);
  const patchesRef = useRef<LayerPatch[]>([]);
  const [marquee, setMarquee] = useState<{ from: Point; to: Point } | null>(null);
  const [space, setSpace] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const cancelGesture = useCallback(() => {
    gesture.current = null;
    patchesRef.current = [];
    motion.stop();
    controller.setGesture([]);
    setMarquee(null);
  }, [motion, controller]);
  const displayPage = page;
  const displayIndex = useMemo(() => createLayerGeometryIndex(displayPage), [displayPage]);
  const beforePaint = useCallback(() => {
    if (
      gesture.current &&
      (!isGestureOriginCurrent(engine, gesture.current.origin) || controller.read().playback)
    )
      cancelGesture();
  }, [engine, controller, cancelGesture]);
  useCanvasPresentation({ controller, workspace, motion, viewport, beforePaint });

  function pagePoint(event: { clientX: number; clientY: number }): Point {
    return clientToPage(
      { x: event.clientX, y: event.clientY },
      viewport.current!.getBoundingClientRect(),
      pageViewSource.read(),
      controller.read().page,
    );
  }
  function capture(event: ReactPointerEvent) {
    viewport.current?.focus();
    viewport.current?.setPointerCapture(event.pointerId);
  }
  function beginHandle(event: ReactPointerEvent, layer: Layer, handle: Handle) {
    event.preventDefault();
    event.stopPropagation();
    capture(event);
    const point = pagePoint(event);
    gesture.current = {
      origin: captureGestureOrigin(engine),
      mode: "resize",
      from: point,
      current: point,
      client: { x: event.clientX, y: event.clientY },
      view: viewRef.current,
      layers: [layer],
      handle,
    };
  }
  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    const layer = page.layers.find((item) => item.id === event.currentTarget.dataset.layerId);
    const handle = event.currentTarget.dataset.handle as Handle;
    if (layer) beginHandle(event, layer, handle);
  }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.button !== 0 && event.button !== 1) || controller.read().playback) return;
    if ((event.target as HTMLElement).closest("[data-canvas-control]")) return;
    event.preventDefault();
    capture(event);
    const point = pagePoint(event);
    const base = {
      origin: captureGestureOrigin(engine),
      from: point,
      current: point,
      client: { x: event.clientX, y: event.clientY },
      view: viewRef.current,
      layers: [] as Layer[],
    };
    if (tool === "hand" || space || event.button === 1) {
      gesture.current = { ...base, mode: "pan" };
      return;
    }
    const world = workspace.read();
    const worldPoint = clientToPage(
      { x: event.clientX, y: event.clientY },
      viewport.current!.getBoundingClientRect(),
      motion.read(),
      world,
    );
    const targetBoard = artboardAt(world, worldPoint);
    if (targetBoard && targetBoard.id !== controller.read().page.id) {
      engine.setPage(targetBoard.id);
      const hit = createLayerGeometryIndex(controller.read().page).hitTest({
        x: worldPoint.x - targetBoard.x,
        y: worldPoint.y - targetBoard.y,
      });
      engine.select(hit ? [hit.id] : []);
      return;
    }
    if (!targetBoard && tool !== "pointer") return;
    if (tool === "shape" || tool === "rectangle" || tool === "ellipse" || tool === "text") {
      const shape =
        tool === "shape"
          ? createArtworkLayer(store.get(shapeChoiceAtom), point)
          : tool === "text"
            ? createLayer("text", {
                x: point.x,
                y: point.y,
                width: 1,
                height: 1,
                text: t("newText", { defaultValue: "Votre texte" }),
                fontSize: 48,
                fill: "#202024",
              })
            : createLayer(tool, {
                x: point.x,
                y: point.y,
                width: 1,
                height: 1,
                fill: "#2563eb",
                radius: tool === "rectangle" ? 12 : 0,
              });
      controller.setGesture([], shape);
      gesture.current = { ...base, mode: "draw", shape };
      return;
    }
    const currentPage = controller.read().page;
    const hit = createLayerGeometryIndex(currentPage).hitTest(point);
    if (tool === "wand" || tool === "segment") {
      if (hit?.kind === "image") {
        engine.select([hit.id]);
        const local = transformPoint(
          invertMatrix(createLayerGeometryIndex(currentPage).worldMatrix(hit.id)),
          point,
        );
        onImagePoint?.(hit.id, local.x, local.y);
      } else
        onError?.(
          t("selectImageFirst", { defaultValue: "Cliquez sur une image pour créer son masque." }),
        );
      return;
    }
    if (!hit) {
      if (!event.shiftKey) engine.select([]);
      gesture.current = { ...base, mode: "box" };
      setMarquee({ from: point, to: point });
      return;
    }
    const ids = event.shiftKey
      ? snapshot.selection.includes(hit.id)
        ? snapshot.selection.filter((id) => id !== hit.id)
        : [...snapshot.selection, hit.id]
      : snapshot.selection.includes(hit.id)
        ? snapshot.selection
        : [hit.id];
    engine.select(ids);
    gesture.current = { ...base, mode: "move", layers: selectedRoots(currentPage, ids) };
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active) return;
    if (!isGestureOriginCurrent(engine, active.origin)) {
      cancelGesture();
      return;
    }
    const point = pagePoint(event);
    active.current = point;
    if (active.mode === "pan") {
      motion.jump(
        {
          ...active.view,
          x: active.view.x + event.clientX - active.client.x,
          y: active.view.y + event.clientY - active.client.y,
        },
        false,
      );
      return;
    }
    if (active.mode === "box") {
      setMarquee({ from: active.from, to: point });
      return;
    }
    if (active.mode === "draw" && active.shape) {
      const shape = resizeDrawing(active.shape, active.from, point, event.shiftKey);
      active.shape = shape;
      controller.setGesture([], shape);
      return;
    }
    const next =
      active.mode === "resize"
        ? [resizePatch(page, active.layers[0]!, active.handle!, active.from, point, event.shiftKey)]
        : movePatches(
            page,
            active.layers,
            active.from,
            point,
            !event.altKey,
            6 / viewRef.current.zoom,
          );
    patchesRef.current = next;
    controller.setGesture(next);
  }
  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active) return;
    if (!isGestureOriginCurrent(engine, active.origin)) {
      cancelGesture();
      return;
    }
    const commands = patchesToCommands(patchesRef.current);
    // Clear the transient frame before publishing canonical edits in this same input task.
    // Otherwise observers materialize the entire preview again over the new document.
    cancelGesture();
    try {
      if (active.mode === "move" || active.mode === "resize") {
        if (Math.hypot(event.clientX - active.client.x, event.clientY - active.client.y) > 1)
          engine.transaction(commands);
      } else if (active.mode === "draw" && active.shape) {
        const shape = completeDrawing(
          active.shape.kind === "text"
            ? resizeDrawing(active.shape, active.from, pagePoint(event), false)
            : active.shape,
          Math.hypot(event.clientX - active.client.x, event.clientY - active.client.y) > 3,
        );
        engine.execute({ type: "addLayers", layers: [shape] });
        engine.select([shape.id]);
      } else if (active.mode === "box") {
        const selected = boxSelection(controller.read().page, active.from, active.current);
        engine.select(
          event.shiftKey ? [...new Set([...snapshot.selection, ...selected])] : selected,
        );
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    } finally {
      cancelGesture();
      viewport.current?.releasePointerCapture(event.pointerId);
    }
  }

  const selected = useMemo(() => {
    const ids = new Set(snapshot.selection);
    return displayPage.layers.filter(
      (layer) => ids.has(layer.id) && displayIndex.isVisible(layer.id),
    );
  }, [displayPage, displayIndex, snapshot.selection]);
  const cursor = tool === "hand" || space ? "grab" : tool === "pointer" ? "default" : "crosshair";
  return (
    <div
      className="editor-canvas"
      data-testid="editor-canvas"
      aria-label={t("canvas", { defaultValue: "Zone de création" })}
      ref={viewport}
      tabIndex={0}
      style={{ cursor }}
      onPointerDownCapture={() => motion.stop()}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={cancelGesture}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-canvas-control]")) return;
        if (event.code === "Space") {
          event.preventDefault();
          setSpace(true);
        }
        if (event.key === "Escape") {
          cancelGesture();
          engine.select([]);
        }
      }}
      onKeyUp={(event) => {
        if (event.code === "Space") setSpace(false);
      }}
      onBlur={() => setSpace(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const world = workspace.read();
        const target = artboardAt(
          world,
          clientToPage(
            { x: event.clientX, y: event.clientY },
            event.currentTarget.getBoundingClientRect(),
            motion.read(),
            world,
          ),
        );
        if (target) engine.setPage(target.id);
        onDropFiles?.(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="canvas-stage">
        <InactiveArtboards
          engine={engine}
          workspace={layout}
          activeId={page.id}
          projectId={snapshot.project.id}
          view={shown}
          viewport={viewport}
          services={services}
        />
        <div
          className="canvas-artboard"
          data-testid="artboard"
          data-artboard-id={page.id}
          data-active="true"
          data-zoom={shown.zoom}
          data-pan-x={shown.x}
          data-pan-y={shown.y}
          data-view-moving={motion.isMoving()}
          style={artboardStyle(activeBoard, layout, shown)}
        >
          <EditorScene
            controller={controller}
            onError={onError}
            zoom={view.zoom}
            fontResolver={fontResolver}
          />
          <GuideOverlay
            controller={controller}
            engine={engine}
            page={displayPage}
            selected={snapshot.selection}
            view={pageView}
            viewSource={pageViewSource}
            viewport={viewport}
          />
          <Measurements
            controller={controller}
            selected={snapshot.selection}
            zoom={shown.zoom}
            viewSource={motion}
          />
          <SelectionOverlays
            page={displayPage}
            selected={selected}
            zoom={shown.zoom}
            controller={controller}
            viewSource={motion}
            onHandle={handlePointerDown}
          />
          {marquee && (
            <div
              className="canvas-marquee"
              style={{
                left: Math.min(marquee.from.x, marquee.to.x),
                top: Math.min(marquee.from.y, marquee.to.y),
                width: Math.abs(marquee.to.x - marquee.from.x),
                height: Math.abs(marquee.to.y - marquee.from.y),
              }}
            />
          )}
        </div>
        <ArtboardHeadings
          controller={controller}
          engine={engine}
          workspace={layout}
          activeId={page.id}
          view={shown}
          onError={onError}
        />
      </div>
      <Rulers
        controller={controller}
        engine={engine}
        page={page}
        view={pageView}
        viewSource={pageViewSource}
        viewport={viewport}
      />
      <ViewportControls view={shown} actions={viewportActions} />
      <QuickAdd
        engine={engine}
        viewport={viewport}
        workspace={workspace}
        viewSource={motion}
        controller={controller}
        onError={onError}
      />
      <div className="canvas-help">
        {tool === "pointer"
          ? t("canvasHint", { defaultValue: "Espace pour déplacer · Ctrl + molette pour zoomer" })
          : t("toolHint", { defaultValue: "Cliquez ou tracez sur le canvas" })}
      </div>
      {dragOver && (
        <div className="canvas-drag-overlay">
          {t("dropImages", { defaultValue: "Déposez vos images ici" })}
        </div>
      )}
    </div>
  );
}

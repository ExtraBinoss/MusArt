import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useStore } from "jotai";
import type { EditorCanvasProps } from "./session/canvas-contracts";
export type { EditorCanvasProps } from "./session/canvas-contracts";
import { shapeChoiceAtom } from "../components/assets/selection";
import { createArtworkLayer } from "./interaction/shapes";
import { completeDrawing, resizeDrawing } from "./interaction/drawing";
import { readReleasePoint } from "./interaction/release";
import { useTranslation } from "react-i18next";
import {
  createLayer,
  createLayerGeometryIndex,
  invertMatrix,
  transformPoint,
  type Layer,
} from "@musart/core";
import { EditorScene } from "./render/EditorScene";
import { SceneController } from "./session/scene-controller";
import { createCanvasView } from "./session/view-state";
import { useRenderMetrics } from "../state/session/render-metrics";
import { EMPTY_PREVIEW_SOURCE } from "../state/session/preview-source";
import {
  clickSelection,
  patchesToCommands,
  selectedRoots,
  type Handle,
  type LayerPatch,
} from "./interaction/gestures";
import { clientToPage, type Point, type View } from "./viewport/view";
import { useViewport } from "./viewport/use-viewport";
import { ViewportControls } from "./viewport/ViewportControls";
import { createWorkspace, createArtboardView } from "./artboards/workspace";
import { artboardAt, viewForArtboard } from "./artboards/layout";
import { artboardStyle } from "./artboards/presentation";
import { ArtboardHeadings } from "./artboards/ArtboardHeadings";
import { ArtboardModeFooter } from "./artboards/ArtboardModeFooter";
import { InactiveArtboards } from "./artboards/InactiveArtboards";
import { captureGestureOrigin, isGestureOriginCurrent } from "./interaction/gesture-origin";
import "./artboards/artboards.css";
import { QuickAdd } from "./quick-add/QuickAdd";
import { CanvasSelection } from "./selection/CanvasSelection";
import { canvasHit } from "./selection/hit";
import { useMarquee } from "./selection/use-marquee";
import { createLiveMarquee } from "./selection/live-marquee";
import * as marqueeScope from "./selection/marquee-scope";
import { useCanvasPresentation } from "./viewport/use-canvas-presentation";
import { CanvasRulers } from "./guides/CanvasRulers";
import { Measurements } from "./guides/Measurements";
import { useWand } from "./interaction/use-wand";
import { PixelSelectionOverlay, PixelSelectionToolbar } from "./selection/PixelSelectionOverlay";
import { attachmentSelection } from "../state/selection/attachments";
import {
  useTransformSnapping,
  type TransformGesture,
} from "./interaction/snapping/use-transform-snapping";
import { EffectGizmo } from "./effects/EffectGizmo";
import "./canvas.css";
export type { Tool } from "./interaction/gestures";

interface Gesture extends TransformGesture, marqueeScope.MarqueeScope {
  pointerId: number;
  mode: "pan" | "move" | "resize" | "box" | "draw";
  view: View;
  layers: Layer[];
  handle?: Handle;
  shape?: Layer;
  current: Point;
  boxStarted?: boolean;
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
  const { feedback: snapFeedback, update: updateTransform } = useTransformSnapping({
    engine,
    controller,
    view: pageViewSource,
    gesture,
    patches: patchesRef,
  });
  const marqueeElement = useRef<HTMLDivElement>(null);
  const marquee = useMarquee(marqueeElement);
  const liveMarquee = useMemo(
    () =>
      createLiveMarquee(engine, {
        request: (callback) => requestAnimationFrame(callback),
        cancel: (handle) => cancelAnimationFrame(handle),
      }),
    [engine],
  );
  useEffect(() => () => liveMarquee.cancel(), [liveMarquee]);
  const [space, setSpace] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const wand = useWand({ port: services?.pixelSelection, store, tool, onError });
  const cancelWand = wand.cancel;
  const pixelSelection = services?.pixelSelection;
  const cancelGesture = useCallback(
    (capturedPointerId?: number) => {
      liveMarquee.cancel();
      cancelWand();
      const pointerId = gesture.current?.pointerId ?? capturedPointerId;
      gesture.current = null;
      if (pointerId !== undefined && viewport.current?.hasPointerCapture(pointerId))
        viewport.current.releasePointerCapture(pointerId);
      patchesRef.current = [];
      snapFeedback.clear();
      motion.stop();
      controller.setGesture([]);
      marquee.clear();
    },
    [motion, controller, cancelWand, snapFeedback, marquee, liveMarquee],
  );
  const beforePaint = useCallback(() => {
    if (controller.read().playback && pixelSelection?.read()) pixelSelection.deselect();
    if (
      gesture.current &&
      (!isGestureOriginCurrent(engine, gesture.current.origin) || controller.read().playback)
    )
      cancelGesture();
  }, [engine, controller, cancelGesture, pixelSelection]);
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
      pointerId: event.pointerId,
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
    if (event.button !== 0) return;
    if (gesture.current && gesture.current.pointerId !== event.pointerId) return;
    const layer = page.layers.find((item) => item.id === event.currentTarget.dataset.layerId);
    const handle = event.currentTarget.dataset.handle as Handle;
    if (layer) beginHandle(event, layer, handle);
  }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button < 0 || event.button > 2 || controller.read().playback) return;
    if (gesture.current && gesture.current.pointerId !== event.pointerId) return;
    if ((event.target as HTMLElement).closest("[data-canvas-control]")) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    capture(event);
    const point = pagePoint(event);
    const base = {
      origin: captureGestureOrigin(engine),
      pointerId: event.pointerId,
      from: point,
      current: point,
      client: { x: event.clientX, y: event.clientY },
      view: viewRef.current,
      layers: [] as Layer[],
    };
    if (event.button !== 2 && (tool === "hand" || space || event.button === 1)) {
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
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (event.button === 2) {
      gesture.current = {
        ...base,
        mode: "box",
        boxSelection: marqueeScope.intersectingMarquee(engine, additive, targetBoard?.id),
      };
      return;
    }
    attachmentSelection(engine).clear();
    if (targetBoard && targetBoard.id !== controller.read().page.id) {
      engine.setPage(targetBoard.id);
      const hit = canvasHit(
        controller.read().page,
        {
          x: worldPoint.x - targetBoard.x,
          y: worldPoint.y - targetBoard.y,
        },
        tool === "pointer",
      )?.layer;
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
    const picked = canvasHit(currentPage, point, tool === "pointer"),
      hit = picked?.layer;
    if (tool === "wand" || tool === "segment") {
      if (hit?.kind === "image") {
        engine.select([hit.id]);
        const local = transformPoint(
          invertMatrix(createLayerGeometryIndex(currentPage).worldMatrix(hit.id)),
          point,
        );
        if (tool === "segment") onImagePoint?.(hit.id, local.x, local.y);
        else if (!wand.begin(event, hit.id, local.x, local.y)) onError?.(t("selectImageFirst"));
      } else
        onError?.(
          t("selectImageFirst", { defaultValue: "Cliquez sur une image pour créer son masque." }),
        );
      return;
    }
    if (!hit) {
      const initial = engine.getSnapshot().selection;
      if (!additive) engine.select([]);
      gesture.current = {
        ...base,
        mode: "box",
        boxSelection: { initial, additive, intersect: false },
      };
      marquee.show(point, point);
      return;
    }
    const ids = clickSelection(engine.getSnapshot().selection, hit.id, additive);
    engine.select(ids);
    if (picked?.locked) return;
    gesture.current = { ...base, mode: "move", layers: selectedRoots(currentPage, ids) };
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (wand.active()) {
      wand.move(event);
      return;
    }
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (!isGestureOriginCurrent(engine, active.origin)) {
      cancelGesture();
      return;
    }
    if (!marqueeScope.prepareMarqueePage(engine, gesture, event, pagePoint))
      return cancelGesture(active.pointerId);
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
      if (
        active.boxStarted ||
        Math.hypot(event.clientX - active.client.x, event.clientY - active.client.y) > 3
      ) {
        active.boxStarted = true;
        marquee.show(active.from, point);
        liveMarquee.queue(active.from, point, active.boxSelection!);
      }
      return;
    }
    if (active.mode === "draw" && active.shape) {
      const shape = resizeDrawing(active.shape, active.from, point, event.shiftKey);
      active.shape = shape;
      controller.setGesture([], shape);
      return;
    }
    updateTransform(active, point, event.altKey, event.shiftKey);
  }
  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (wand.active()) {
      wand.finish();
      viewport.current?.releasePointerCapture(event.pointerId);
      return;
    }
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (!isGestureOriginCurrent(engine, active.origin)) {
      cancelGesture();
      return;
    }
    if (!marqueeScope.prepareMarqueePage(engine, gesture, event, pagePoint))
      return cancelGesture(active.pointerId);
    if (active.mode === "move" || active.mode === "resize") {
      const finalPoint = readReleasePoint(active, event, () => pagePoint(event));
      if (
        finalPoint &&
        (finalPoint.x !== active.current.x ||
          finalPoint.y !== active.current.y ||
          (active.modifiers &&
            (active.modifiers.alt !== event.altKey || active.modifiers.shift !== event.shiftKey)))
      ) {
        active.current = finalPoint;
        updateTransform(active, finalPoint, event.altKey, event.shiftKey);
      }
    }
    if (active.mode === "box") {
      const box = active.boxSelection!;
      if (
        !box.intersect ||
        active.boxStarted ||
        Math.hypot(event.clientX - active.client.x, event.clientY - active.client.y) > 3
      )
        liveMarquee.queue(
          active.from,
          readReleasePoint(active, event, () => pagePoint(event)) ?? active.current,
          box,
        );
      liveMarquee.commit();
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
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    } finally {
      cancelGesture();
      viewport.current?.releasePointerCapture(event.pointerId);
    }
  }

  function pointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    if (!gesture.current || gesture.current.pointerId === event.pointerId) cancelGesture();
  }
  const gizmoProps = { engine, controller, viewSource: motion, onError };
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
      onPointerCancel={pointerCancel}
      onLostPointerCapture={(event) => {
        if (gesture.current || wand.active()) pointerCancel(event);
      }}
      onContextMenu={(event) => {
        if (!(event.target as HTMLElement).closest("[data-canvas-control]")) event.preventDefault();
      }}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-canvas-control]")) return;
        if (event.code === "Space") {
          event.preventDefault();
          setSpace(true);
        }
        if (event.key === "Escape") {
          const pendingBox = gesture.current?.boxSelection;
          const pixelSelection = Boolean(services?.pixelSelection?.read());
          if (pixelSelection || pendingBox?.intersect) {
            event.preventDefault();
            event.stopPropagation();
          }
          wand.escape();
          if (!pendingBox?.intersect) liveMarquee.discard();
          cancelGesture();
          if (!pixelSelection && !pendingBox?.intersect) engine.select([]);
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
          className="canvas-artboard canvas-artboard-editor"
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
            mediaResolverFor={services?.mediaResolverFor}
          />
          <CanvasSelection
            controller={controller}
            engine={engine}
            viewSource={pageViewSource}
            viewport={viewport}
            showHandles={tool !== "wand" && tool !== "segment"}
            onHandle={handlePointerDown}
          />
          <Measurements
            controller={controller}
            snapping={snapFeedback}
            zoom={shown.zoom}
            viewSource={motion}
          />
          <EffectGizmo {...gizmoProps} />
          <div ref={marqueeElement} className="canvas-marquee" hidden />
        </div>
        <PixelSelectionOverlay
          port={services?.pixelSelection}
          controller={controller}
          viewSource={pageViewSource}
          viewport={viewport}
        />
        <ArtboardHeadings
          controller={controller}
          engine={engine}
          workspace={layout}
          activeId={page.id}
          view={shown}
          onError={onError}
        />
        <ArtboardModeFooter engine={engine} workspace={layout} view={shown} />
      </div>
      <CanvasRulers
        controller={controller}
        engine={engine}
        page={page}
        view={pageView}
        viewSource={pageViewSource}
        viewport={viewport}
      />
      <ViewportControls engine={engine} view={shown} actions={viewportActions} />
      <PixelSelectionToolbar port={services?.pixelSelection} onError={onError} />
      <QuickAdd
        engine={engine}
        viewport={viewport}
        workspace={workspace}
        viewSource={motion}
        controller={controller}
        onError={onError}
      />
      {tool !== "pointer" && (
        <div className="canvas-help">
          {t("toolHint", { defaultValue: "Cliquez ou tracez sur le canvas" })}
        </div>
      )}
      {dragOver && (
        <div className="canvas-drag-overlay">
          {t("dropImages", { defaultValue: "Déposez vos images ici" })}
        </div>
      )}
    </div>
  );
}

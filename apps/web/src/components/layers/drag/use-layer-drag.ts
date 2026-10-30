import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type DragEvent,
} from "react";
import type { Composition, EnginePort, Layer } from "@musart/core";
import { layerDragController } from "./controller";
import { layerDragPresentation } from "./presentation";
import { layerDragImage } from "./drag-image";
import { layerDragDiagnostics } from "./diagnostics";

const MIME = "application/x-musart-layer";
/** Native HTML input for the same engine-scoped controller used by pointer-driven clips. */
export function useLayerDrag(
  page: Composition,
  engine: EnginePort,
  run: (action: () => void) => void,
) {
  const owner = useRef(Symbol("native-layer-drag")).current;
  const controller = useMemo(() => layerDragController(engine), [engine]);
  const presentation = useMemo(() => layerDragPresentation(engine), [engine]);
  const diagnostics = useMemo(() => layerDragDiagnostics(engine), [engine]);
  const visual = useSyncExternalStore(controller.subscribe, controller.read, controller.read);
  const canonical =
    visual && engine.getSnapshot().project.pages.find((item) => item.id === visual.pageId);
  const active =
    visual &&
    visual.base === canonical?.layers &&
    (visual.pageId !== page.id || visual.base === page.layers)
      ? visual
      : null;
  const image = useRef<(() => void) | null>(null);
  const cancel = useCallback(() => {
    if (controller.read()) diagnostics.refuse("cancel", "explicitCancellation");
    controller.cancel();
  }, [controller, diagnostics]);
  const cancelOwned = useCallback(() => {
    if (controller.owns(owner)) diagnostics.refuse("cancel", "nativeOwnerReleased");
    controller.cancel(owner);
  }, [controller, diagnostics, owner]);
  useEffect(() => {
    const state = controller.read();
    if (
      controller.owns(owner) &&
      state?.pageId === page.id &&
      engine.getSnapshot().project.pages.find((item) => item.id === page.id) !== page
    ) {
      diagnostics.refuse("cancel", "renderedCompositionReplaced");
      controller.cancel(owner);
    }
  }, [page, controller, engine, diagnostics, owner]);
  useEffect(() => {
    const release = () => {
      image.current?.();
      image.current = null;
    };
    const stop = controller.subscribe(() => {
      if (!controller.owns(owner)) release();
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    const onDrag = (event: globalThis.DragEvent) => {
      if (controller.owns(owner))
        presentation.move({ x: event.clientX, y: event.clientY, alt: event.altKey });
    };
    // Native HTML drags may transfer window focus. Their dragend/drop lifecycle owns
    // termination; blur must not destroy the session before its next dragover.
    const onPageHide = () => {
      if (controller.owns(owner)) diagnostics.refuse("cancel", "pageHidden");
      controller.cancel(owner);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onPageHide();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("dragend", cancelOwned);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("dragover", onDrag);
    return () => {
      stop();
      release();
      if (controller.owns(owner)) diagnostics.refuse("cancel", "nativeAdapterDisposed");
      controller.cancel(owner);
      presentation.release(owner);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("dragend", cancelOwned);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("dragover", onDrag);
    };
  }, [controller, presentation, diagnostics, owner, cancel, cancelOwned]);
  const clearTarget = useCallback(
    (event: DragEvent<HTMLElement>) => {
      controller.clear();
      event.dataTransfer.dropEffect = "none";
      if (controller.read())
        diagnostics.refuse("nativeDragover", "nonLayerTarget", undefined, event);
    },
    [controller, diagnostics],
  );
  const handlers = useMemo(
    () => ({
      start(event: DragEvent<HTMLElement>, layer: Layer, originPage = page) {
        if (!controller.begin(owner, originPage, layer.id, run)) {
          event.preventDefault();
          diagnostics.refuse("nativeDragstart", "sourceRejected", layer.id, event);
          return;
        }
        image.current?.();
        let release: () => void;
        try {
          event.dataTransfer.setData(MIME, layer.id);
          event.dataTransfer.effectAllowed = "move";
          release = layerDragImage(event.currentTarget, event.dataTransfer, layer.name);
          image.current = release;
          presentation.start(owner, event.currentTarget, layer.name, {
            x: event.clientX,
            y: event.clientY,
            alt: event.altKey,
          });
        } catch (error) {
          controller.cancel(owner);
          event.preventDefault();
          run(() => {
            throw error;
          });
          return;
        }
        const nativeEvent = event.nativeEvent;
        queueMicrotask(() => {
          if (image.current === release && nativeEvent.defaultPrevented) {
            diagnostics.refuse("nativeDragstart", "cancelledByEventHandler", layer.id, {
              defaultPrevented: nativeEvent.defaultPrevented,
              dataTransfer: event.dataTransfer,
            });
            controller.cancel(owner);
          }
        });
      },
      over(event: DragEvent<HTMLElement>, layer: Layer, targetPage = page) {
        const accepted = presentation.over(event.currentTarget, layer, targetPage, {
          x: event.clientX,
          y: event.clientY,
          alt: event.altKey,
        });
        event.dataTransfer.dropEffect = accepted ? "move" : "none";
        if (accepted) event.preventDefault();
        else if (controller.read() || Array.from(event.dataTransfer.types ?? []).includes(MIME))
          diagnostics.refuse(
            "nativeDragover",
            controller.read()?.rejected?.reason ?? "inactiveDrag",
            layer.id,
            event,
          );
      },
      overTree(event: DragEvent<HTMLElement>) {
        presentation.move({ x: event.clientX, y: event.clientY, alt: event.altKey });
        const state = controller.read();
        if (state?.target) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        } else if (
          !event.defaultPrevented &&
          Array.from(event.dataTransfer.types ?? []).includes(MIME)
        )
          diagnostics.refuse(
            "nativeDragover",
            state?.rejected?.reason ?? (state ? "noAcceptedLayerTarget" : "inactiveDrag"),
            state?.rejected?.id,
            event,
          );
      },
      drop(event: DragEvent<HTMLElement>, layer?: Layer, targetPage?: Composition) {
        event.preventDefault();
        const current = controller.read();
        if (
          !current ||
          (targetPage &&
            (targetPage.id !== current.pageId ||
              engine.getSnapshot().project.pages.find((item) => item.id === current.pageId) !==
                targetPage))
        ) {
          controller.cancel();
          return;
        }
        if (!current.target && !current.rejected && layer) {
          presentation.over(event.currentTarget, layer, targetPage ?? page, {
            x: event.clientX,
            y: event.clientY,
            alt: event.altKey,
          });
        }
        controller.finish(event.dataTransfer.getData(MIME));
      },
    }),
    [controller, presentation, owner, page, run, engine, diagnostics],
  );
  return {
    layers: active?.layers ?? page.layers,
    pageId: active?.pageId ?? page.id,
    target: active?.target ?? null,
    rejected: active?.rejected ?? null,
    dragging: active?.id ?? null,
    cancel,
    cancelOwned,
    clearTarget,
    handlers,
    ...handlers,
  };
}

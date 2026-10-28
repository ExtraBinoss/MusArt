import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { Composition, EnginePort, Layer, Project } from "@musart/core";
import { getDropCommand, getDropPosition, type LayerDropPosition } from "../drop-target";
import { projectLayerDrop } from "./projection";
import { layerDragImage } from "./drag-image";

const MIME = "application/x-musart-layer";
export function useLayerDrag(
  page: Composition,
  engine: EnginePort,
  run: (action: () => void) => void,
) {
  const [visual, setVisual] = useState<{
    pageId: string;
    base: Layer[];
    id: string;
    layers: Layer[];
    target: { id: string; position: LayerDropPosition } | null;
  } | null>(null);
  const visualPage =
    visual && engine.getSnapshot().project.pages.find((item) => item.id === visual.pageId);
  const active =
    visual &&
    visual.base === visualPage?.layers &&
    (visual.pageId !== page.id || visual.base === page.layers)
      ? visual
      : null;
  const source = useRef<{
    id: string;
    layers: Layer[];
    page: Composition;
    project: Project;
  } | null>(null);
  const candidate = useRef<{ id: string; position: LayerDropPosition } | null>(null);
  const pointer = useRef<{
    x: number;
    y: number;
    alt: boolean;
    scrollTop: number;
    scrollLeft: number;
  } | null>(null);
  const image = useRef<(() => void) | null>(null);
  const cancel = useCallback(() => {
    image.current?.();
    image.current = null;
    source.current = null;
    candidate.current = null;
    pointer.current = null;
    setVisual(null);
  }, []);
  const clearTarget = useCallback((event: DragEvent<HTMLElement>) => {
    candidate.current = null;
    pointer.current = null;
    event.dataTransfer.dropEffect = "none";
    const current = source.current;
    if (current)
      setVisual({
        pageId: current.page.id,
        base: current.layers,
        id: current.id,
        layers: current.layers,
        target: null,
      });
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("dragend", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("dragend", cancel);
      window.removeEventListener("blur", cancel);
      image.current?.();
      image.current = null;
    };
  }, [cancel]);
  // The canonical engine invalidates a drag before stale DOM can deliver its drop.
  useEffect(() => {
    return engine.subscribe(() => {
      const origin = source.current,
        snapshot = engine.getSnapshot();
      if (origin && (snapshot.project !== origin.project || snapshot.pageId !== origin.page.id))
        cancel();
    });
  }, [engine, cancel]);
  useEffect(() => {
    if (source.current?.page.id === page.id && source.current.page !== page) {
      image.current?.();
      image.current = null;
      source.current = null;
      candidate.current = null;
      pointer.current = null;
    }
  }, [page]);
  const handlers = useMemo(() => {
    function position(event: DragEvent<HTMLElement>, layer: Layer) {
      return getDropPosition(
        layer,
        event.clientY,
        event.currentTarget.getBoundingClientRect(),
        event.altKey,
        {
          clientX: event.clientX,
          thumbnail: event.currentTarget
            .querySelector?.("[data-thumbnail-layer-id]")
            ?.getBoundingClientRect(),
        },
      );
    }
    function canonicalOrigin(origin: NonNullable<typeof source.current>) {
      const snapshot = engine.getSnapshot();
      return (
        snapshot.project === origin.project &&
        snapshot.pageId === origin.page.id &&
        snapshot.project.pages.find((item) => item.id === origin.page.id) === origin.page
      );
    }
    return {
      start(event: DragEvent<HTMLElement>, layer: Layer, originPage = page) {
        const before = engine.getSnapshot();
        if (before.project.pages.find((item) => item.id === originPage.id) !== originPage) {
          cancel();
          return;
        }
        engine.setPage(originPage.id);
        source.current = {
          id: layer.id,
          layers: originPage.layers,
          page: originPage,
          project: before.project,
        };
        setVisual({
          pageId: originPage.id,
          base: originPage.layers,
          id: layer.id,
          layers: originPage.layers,
          target: null,
        });
        event.dataTransfer.setData(MIME, layer.id);
        event.dataTransfer.effectAllowed = "move";
        image.current?.();
        const releaseImage = layerDragImage(event.currentTarget, event.dataTransfer, layer.name),
          nativeEvent = event.nativeEvent;
        image.current = releaseImage;
        // A later listener can reject dragstart without the browser ever sending dragend.
        queueMicrotask(() => {
          if (image.current === releaseImage && nativeEvent.defaultPrevented) cancel();
        });
      },
      over(event: DragEvent<HTMLElement>, layer: Layer, targetPage = page) {
        const current = source.current;
        if (!current) return;
        if (!canonicalOrigin(current)) {
          cancel();
          return;
        }
        if (targetPage !== current.page) {
          clearTarget(event);
          return;
        }
        // Layout motion can change the row under a stationary pointer. Keep the
        // user's last insertion intent until the pointer, modifier or tree scroll moves.
        const tree = event.currentTarget.closest?.('[role="tree"]');
        const scrollTop = tree?.scrollTop ?? 0,
          scrollLeft = tree?.scrollLeft ?? 0;
        if (
          candidate.current &&
          pointer.current?.x === event.clientX &&
          pointer.current.y === event.clientY &&
          pointer.current.alt === event.altKey &&
          pointer.current.scrollTop === scrollTop &&
          pointer.current.scrollLeft === scrollLeft
        ) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          return;
        }
        if (layer.id === current.id) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          return;
        }
        pointer.current = {
          x: event.clientX,
          y: event.clientY,
          alt: event.altKey,
          scrollTop,
          scrollLeft,
        };
        const drop = position(event, layer);
        const next = projectLayerDrop(current.layers, current.id, layer.id, drop);
        event.dataTransfer.dropEffect = next ? "move" : "none";
        if (!next) {
          candidate.current = null;
          setVisual({
            pageId: current.page.id,
            base: current.layers,
            id: current.id,
            layers: current.layers,
            target: null,
          });
          return;
        }
        event.preventDefault();
        if (candidate.current?.id === layer.id && candidate.current.position === drop) return;
        candidate.current = { id: layer.id, position: drop };
        setVisual({
          pageId: current.page.id,
          base: current.layers,
          id: current.id,
          layers: next,
          target: candidate.current,
        });
      },
      overTree(event: DragEvent<HTMLElement>) {
        if (source.current && candidate.current && canonicalOrigin(source.current)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      },
      drop(event: DragEvent<HTMLElement>, layer?: Layer, targetPage?: Composition) {
        event.preventDefault();
        const id = event.dataTransfer.getData(MIME);
        const current = source.current;
        if (!current || (targetPage && targetPage !== current.page)) {
          cancel();
          return;
        }
        const destination = candidate.current
          ? (current.layers.find((item) => item.id === candidate.current!.id) ?? layer)
          : layer;
        if (!destination) {
          cancel();
          return;
        }
        const drop = candidate.current?.position ?? position(event, destination);
        const valid =
          current?.id === id &&
          canonicalOrigin(current) &&
          projectLayerDrop(current.layers, id, destination.id, drop);
        cancel();
        const mask = destination.mask,
          sameMask =
            mask?.layerId === id && mask.mode === "alpha" && mask.enabled && !mask.inverted;
        const changed =
          valid &&
          (drop === "mask"
            ? !sameMask
            : valid.some(
                (item, index) =>
                  item.id !== current.layers[index]!.id ||
                  item.parentId !== current.layers[index]!.parentId,
              ));
        if (changed)
          run(() => {
            // Task runners may defer execution beyond the drop event and React render.
            if (canonicalOrigin(current))
              engine.execute(getDropCommand(id, destination, drop, current.layers));
          });
      },
    };
  }, [page, engine, run, cancel, clearTarget]);
  return {
    layers: active?.layers ?? page.layers,
    pageId: active?.pageId ?? page.id,
    target: active?.target ?? null,
    dragging: active?.id ?? null,
    cancel,
    clearTarget,
    handlers,
    ...handlers,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { Composition, EnginePort, Layer } from "@musart/core";
import { getDropCommand, getDropPosition, type LayerDropPosition } from "../drop-target";
import { projectLayerDrop } from "./projection";

const MIME = "application/x-musart-layer";
export function useLayerDrag(
  page: Composition,
  engine: EnginePort,
  run: (action: () => void) => void,
) {
  const [visual, setVisual] = useState<{
    base: Layer[];
    id: string;
    layers: Layer[];
    target: { id: string; position: LayerDropPosition } | null;
  } | null>(null);
  const active = visual?.base === page.layers ? visual : null;
  const source = useRef<{ id: string; layers: Layer[] } | null>(null);
  const candidate = useRef<{ id: string; position: LayerDropPosition } | null>(null);
  const pointer = useRef<{
    x: number;
    y: number;
    alt: boolean;
    scrollTop: number;
    scrollLeft: number;
  } | null>(null);
  const cancel = useCallback(() => {
    source.current = null;
    candidate.current = null;
    pointer.current = null;
    setVisual(null);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel]);
  // A concurrent edit or page switch invalidates the drag's original stack.
  useEffect(() => {
    source.current = null;
    candidate.current = null;
    pointer.current = null;
  }, [page.id, page.layers]);
  const handlers = useMemo(() => {
    function position(event: DragEvent<HTMLElement>, layer: Layer) {
      return getDropPosition(
        layer,
        event.clientY,
        event.currentTarget.getBoundingClientRect(),
        event.altKey,
      );
    }
    function canonicalOrigin() {
      const snapshot = engine.getSnapshot();
      return (
        snapshot.pageId === page.id &&
        snapshot.project.pages.find((item) => item.id === page.id)?.layers === page.layers
      );
    }
    return {
      start(event: DragEvent<HTMLElement>, layer: Layer) {
        if (!canonicalOrigin()) {
          cancel();
          return;
        }
        source.current = { id: layer.id, layers: page.layers };
        setVisual({ base: page.layers, id: layer.id, layers: page.layers, target: null });
        event.dataTransfer.setData(MIME, layer.id);
        event.dataTransfer.effectAllowed = "move";
      },
      over(event: DragEvent<HTMLElement>, layer: Layer) {
        const current = source.current;
        if (!current || current.layers !== page.layers) return;
        if (!canonicalOrigin()) {
          cancel();
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
        if (layer.id === current.id && candidate.current) {
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
        const next = projectLayerDrop(page.layers, current.id, layer.id, drop);
        event.dataTransfer.dropEffect = next ? "move" : "none";
        if (!next) {
          candidate.current = null;
          setVisual({ base: page.layers, id: current.id, layers: page.layers, target: null });
          return;
        }
        event.preventDefault();
        if (candidate.current?.id === layer.id && candidate.current.position === drop) return;
        candidate.current = { id: layer.id, position: drop };
        setVisual({ base: page.layers, id: current.id, layers: next, target: candidate.current });
      },
      overTree(event: DragEvent<HTMLElement>) {
        if (source.current?.layers === page.layers && candidate.current && canonicalOrigin()) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      },
      drop(event: DragEvent<HTMLElement>, layer?: Layer) {
        event.preventDefault();
        const id = event.dataTransfer.getData(MIME);
        const current = source.current;
        const destination = candidate.current
          ? (page.layers.find((item) => item.id === candidate.current!.id) ?? layer)
          : layer;
        if (!destination) {
          cancel();
          return;
        }
        const drop = candidate.current?.position ?? position(event, destination);
        const valid =
          current?.id === id &&
          current.layers === page.layers &&
          canonicalOrigin() &&
          projectLayerDrop(page.layers, id, destination.id, drop);
        cancel();
        const changed =
          valid &&
          (drop === "mask" ||
            valid.some(
              (item, index) =>
                item.id !== page.layers[index]!.id ||
                item.parentId !== page.layers[index]!.parentId,
            ));
        if (changed)
          run(() => {
            // Task runners may defer execution beyond the drop event and React render.
            if (canonicalOrigin())
              engine.execute(getDropCommand(id, destination, drop, page.layers));
          });
      },
    };
  }, [page, engine, run, cancel]);
  return {
    layers: active?.layers ?? page.layers,
    target: active?.target ?? null,
    dragging: active?.id ?? null,
    cancel,
    handlers,
    ...handlers,
  };
}

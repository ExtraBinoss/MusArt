import type { Composition, EnginePort, Layer } from "@musart/core";
import { createDragAutoScroll } from "../../shared/scroll/drag-auto-scroll";
import { getDropPosition } from "../drop-target";
import { layerDragController } from "./controller";
import { layerDragPreview } from "./drag-image";

export interface LayerDragPoint {
  x: number;
  y: number;
  alt: boolean;
}
const documentOwners = new WeakMap<Document, symbol>();
/** Shared DOM adapter: one pointer, one cached hit target and one active viewport frame loop. */
export function createLayerDragPresentation(engine: EnginePort) {
  const controller = layerDragController(engine);
  let owner: symbol | null = null;
  let point: LayerDragPoint | null = null;
  let viewport: HTMLElement | null = null;
  let scroll: ReturnType<typeof createDragAutoScroll> | null = null;
  let ghost: HTMLElement | null = null;
  let stopState: (() => void) | null = null;
  let version = 0;
  const rectangles = new WeakMap<HTMLElement, { version: number; bounds: DOMRect }>();
  let previous: {
    point: LayerDragPoint;
    top: number;
    left: number;
    viewport: HTMLElement | null;
    valid: boolean;
    version: number;
    targetId: string;
  } | null = null;
  function invalidate() {
    version++;
  }
  function release(lease?: symbol) {
    if (lease !== undefined && owner !== lease) return;
    const previousOwner = owner;
    owner = null;
    scroll?.stop();
    scroll = null;
    viewport = null;
    ghost?.remove();
    ghost = null;
    stopState?.();
    stopState = null;
    point = null;
    previous = null;
    window.removeEventListener("resize", invalidate);
    window.removeEventListener("scroll", invalidate, true);
    if (previousOwner !== null && documentOwners.get(document) === previousOwner) {
      documentOwners.delete(document);
      delete document.documentElement.dataset.layerReorderActive;
    }
  }
  function bounds(row: HTMLElement) {
    const cached = rectangles.get(row);
    if (cached?.version === version) return cached.bounds;
    const next = row.getBoundingClientRect();
    rectangles.set(row, { version, bounds: next });
    return next;
  }
  function apply(
    row: HTMLElement,
    layer: Layer,
    page: Composition,
    input: LayerDragPoint,
  ): boolean {
    const state = controller.read();
    if (!state) return false;
    if (
      state.pageId !== page.id ||
      engine.getSnapshot().project.pages.find((item) => item.id === state.pageId) !== page
    ) {
      previous = null;
      return controller.preview(page, layer, "before");
    }
    const top = viewport?.scrollTop ?? 0,
      left = viewport?.scrollLeft ?? 0;
    if (
      previous &&
      (previous.version === version || previous.targetId !== layer.id) &&
      previous.point.x === input.x &&
      previous.point.y === input.y &&
      previous.point.alt === input.alt &&
      previous.top === top &&
      previous.left === left &&
      previous.viewport === viewport
    )
      return previous.valid;
    const thumbnail = row.querySelector<HTMLElement>("[data-thumbnail-layer-id]");
    const position = getDropPosition(layer, input.y, bounds(row), input.alt, {
      clientX: input.x,
      ...(thumbnail ? { thumbnail: bounds(thumbnail) } : {}),
    });
    const valid = controller.preview(page, layer, position);
    previous = { point: input, top, left, viewport, valid, version, targetId: layer.id };
    return valid;
  }
  function hit() {
    if (!point || !controller.read()) return;
    if (ghost) ghost.style.transform = `translate3d(${point.x + 12}px,${point.y + 12}px,0)`;
    const row = document
      .elementFromPoint?.(point.x, point.y)
      ?.closest<HTMLElement>("[data-layer-drop-id]");
    if (!row) {
      controller.clear();
      previous = null;
      return;
    }
    const nextViewport = row.closest<HTMLElement>("[data-layer-drag-viewport]");
    if (nextViewport) bindViewport(nextViewport);
    const id = row.dataset.layerDropId!,
      pageId = row.dataset.layerDropPageId;
    if (row.dataset.layerDropKind === "property") {
      controller.clear({ id, reason: "property" });
      previous = null;
      return;
    }
    const page = engine.getSnapshot().project.pages.find((item) => item.id === pageId);
    const layer = page?.layers.find((item) => item.id === id);
    if (!page || !layer) {
      controller.clear();
      previous = null;
      return;
    }
    apply(row, layer, page, point);
  }
  function bindViewport(node: HTMLElement) {
    if (viewport === node) return;
    scroll?.stop();
    viewport = node;
    previous = null;
    invalidate();
    if (!node.isConnected) {
      scroll = null;
      return;
    }
    scroll = createDragAutoScroll({
      viewport: node,
      verticalOnly: true,
      topInset: Number(node.dataset.layerDragTopInset ?? 0),
      leftInset: 0,
      onScroll: invalidate,
      onGeometryChange: invalidate,
      onFrame: hit,
    });
    if (point) scroll.update(point.x, point.y);
  }
  return {
    start(lease: symbol, row: HTMLElement, name: string, input: LayerDragPoint, showGhost = false) {
      release();
      owner = lease;
      point = input;
      if (showGhost) {
        ghost = layerDragPreview(row, name);
        Object.assign(ghost.style, {
          left: "0",
          top: "0",
          zIndex: "10001",
          willChange: "transform",
          transform: `translate3d(${input.x + 12}px,${input.y + 12}px,0)`,
        });
      }
      document.documentElement.dataset.layerReorderActive = "true";
      documentOwners.set(document, lease);
      stopState = controller.subscribe(() => {
        invalidate();
        if (!controller.read()) release(lease);
      });
      window.addEventListener("resize", invalidate);
      window.addEventListener("scroll", invalidate, true);
      const node = row.closest<HTMLElement>("[data-layer-drag-viewport],[role=tree]");
      if (node) bindViewport(node);
    },
    move(input: LayerDragPoint) {
      if (!owner || !controller.read()) return;
      point = input;
      scroll?.update(input.x, input.y);
    },
    over(row: HTMLElement, layer: Layer, page: Composition, input: LayerDragPoint) {
      if (!controller.read()) return false;
      point = input;
      const node = row.closest<HTMLElement>("[data-layer-drag-viewport],[role=tree]");
      if (node) bindViewport(node);
      const valid = apply(row, layer, page, input);
      scroll?.update(input.x, input.y);
      return valid;
    },
    release,
    invalidate,
    flush: hit,
  };
}

const presentations = new WeakMap<EnginePort, ReturnType<typeof createLayerDragPresentation>>();
export function layerDragPresentation(engine: EnginePort) {
  let presentation = presentations.get(engine);
  if (!presentation) {
    presentation = createLayerDragPresentation(engine);
    presentations.set(engine, presentation);
  }
  return presentation;
}

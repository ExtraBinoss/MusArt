import {
  createLayerGeometryIndex,
  type Composition,
  type EnginePort,
  type Layer,
  type Project,
} from "@musart/core";
import { getDropCommand, type LayerDropPosition } from "../drop-target";
import { validateLayerDrop, type LayerDropRejection } from "./validation";

export interface LayerDragTarget {
  id: string;
  position: LayerDropPosition;
}
export interface LayerDragState {
  pageId: string;
  base: Layer[];
  id: string;
  layers: Layer[];
  target: LayerDragTarget | null;
  rejected: { id: string; reason: LayerDropRejection } | null;
}
interface Origin {
  id: string;
  page: Composition;
  project: Project;
  owner: symbol;
  run: (action: () => void) => void;
}

/** Engine-scoped semantic state; pointer pixels and DOM resources belong to input adapters. */
export class LayerDragController {
  private origin: Origin | null = null;
  private state: LayerDragState | null = null;
  private listeners = new Set<() => void>();
  private stopEngine: (() => void) | null = null;
  constructor(private readonly engine: EnginePort) {}
  read = (): LayerDragState | null => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(state: LayerDragState | null) {
    if (this.state === state) return;
    this.state = state && Object.freeze(state);
    for (const listener of this.listeners) listener();
  }
  private canonical(origin: Origin): boolean {
    const snapshot = this.engine.getSnapshot();
    return (
      snapshot.project === origin.project &&
      snapshot.pageId === origin.page.id &&
      snapshot.project.pages.find((page) => page.id === origin.page.id) === origin.page
    );
  }
  owns(owner: symbol) {
    return this.origin?.owner === owner;
  }
  begin(owner: symbol, page: Composition, id: string, run: (action: () => void) => void): boolean {
    const snapshot = this.engine.getSnapshot();
    if (snapshot.project.pages.find((item) => item.id === page.id) !== page) return false;
    const geometry = createLayerGeometryIndex(page);
    if (!geometry.byId.has(id) || geometry.isLocked(id)) return false;
    this.cancel();
    this.engine.setPage(page.id);
    const origin = { id, page, project: snapshot.project, owner, run };
    if (!this.canonical(origin)) return false;
    this.origin = origin;
    this.stopEngine = this.engine.subscribe(() => {
      if (this.origin === origin && !this.canonical(origin)) this.cancel();
    });
    this.publish({
      pageId: page.id,
      base: page.layers,
      id,
      layers: page.layers,
      target: null,
      rejected: null,
    });
    return true;
  }
  clear(reason?: { id: string; reason: LayerDropRejection }) {
    const origin = this.origin;
    if (!origin || !this.canonical(origin)) {
      this.cancel();
      return;
    }
    if (
      !this.state?.target &&
      this.state?.rejected?.id === reason?.id &&
      this.state?.rejected?.reason === reason?.reason
    )
      return;
    this.publish({
      pageId: origin.page.id,
      base: origin.page.layers,
      id: origin.id,
      layers: origin.page.layers,
      target: null,
      rejected: reason ?? null,
    });
  }
  preview(page: Composition, target: Layer, position: LayerDropPosition): boolean {
    const origin = this.origin;
    if (!origin) return false;
    if (!this.canonical(origin)) {
      this.cancel();
      return false;
    }
    if (page !== origin.page) {
      this.clear({ id: target.id, reason: "crossComposition" });
      return false;
    }
    if (target.id === origin.id) return true;
    if (this.state?.target?.id === target.id && this.state.target.position === position)
      return true;
    const result = validateLayerDrop(origin.page, origin.id, target.id, position);
    if ("reason" in result) {
      this.clear({ id: target.id, reason: result.reason });
      return false;
    }
    this.publish({
      pageId: page.id,
      base: page.layers,
      id: origin.id,
      layers: result.layers,
      target: { id: target.id, position },
      rejected: null,
    });
    return true;
  }
  finish(id: string): boolean {
    const origin = this.origin,
      target = this.state?.target;
    if (!origin || !target || id !== origin.id || !this.canonical(origin)) {
      this.cancel();
      return false;
    }
    const destination = origin.page.layers.find((layer) => layer.id === target.id);
    if (!destination) {
      this.cancel();
      return false;
    }
    const result = validateLayerDrop(origin.page, id, destination.id, target.position);
    if ("reason" in result) {
      this.cancel();
      return false;
    }
    const mask = destination.mask;
    const changed =
      target.position === "mask"
        ? !(mask?.layerId === id && mask.mode === "alpha" && mask.enabled && !mask.inverted)
        : result.layers.some(
            (layer, index) =>
              layer.id !== origin.page.layers[index]!.id ||
              layer.parentId !== origin.page.layers[index]!.parentId,
          );
    this.cancel();
    if (!changed) return false;
    origin.run(() => {
      if (this.canonical(origin))
        this.engine.execute(getDropCommand(id, destination, target.position, origin.page.layers));
    });
    return true;
  }
  cancel(owner?: symbol) {
    if (owner !== undefined && this.origin?.owner !== owner) return;
    this.origin = null;
    this.stopEngine?.();
    this.stopEngine = null;
    this.publish(null);
  }
}

const controllers = new WeakMap<EnginePort, LayerDragController>();
export function layerDragController(engine: EnginePort): LayerDragController {
  let controller = controllers.get(engine);
  if (!controller) {
    controller = new LayerDragController(engine);
    controllers.set(engine, controller);
  }
  return controller;
}

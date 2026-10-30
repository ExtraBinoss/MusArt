import type { EnginePort } from "@musart/core";
export interface CompositionExportRequest {
  projectId: string;
  compositionId: string;
}
const listeners = new WeakMap<EnginePort, Set<(target: CompositionExportRequest) => void>>();
/** Artboard menus open the existing exporter without activating or editing that artboard. */
export function requestCompositionExport(engine: EnginePort, compositionId: string): void {
  const snapshot = engine.getSnapshot();
  if (!snapshot.project.pages.some((page) => page.id === compositionId)) return;
  for (const listener of listeners.get(engine) ?? [])
    listener({ projectId: snapshot.project.id, compositionId });
}
export function subscribeCompositionExport(
  engine: EnginePort,
  listener: (target: CompositionExportRequest) => void,
): () => void {
  let set = listeners.get(engine);
  if (!set) {
    set = new Set();
    listeners.set(engine, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(engine);
  };
}

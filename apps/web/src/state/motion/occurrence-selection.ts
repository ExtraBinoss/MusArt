import { listLayerMotionOccurrences, type Composition, type EnginePort } from "@musart/core";

export interface MotionOccurrenceSelection {
  read(this: void, page: Composition, layerId: string): string | undefined;
  select(this: void, page: Composition, layerId: string, trackId: string): void;
  subscribe(this: void, listener: () => void): () => void;
}
const sessions = new WeakMap<EnginePort, MotionOccurrenceSelection>();
/** Bounded presentation-only selection, isolated per project and composition. */
export function getMotionOccurrenceSelection(engine: EnginePort): MotionOccurrenceSelection {
  let session = sessions.get(engine);
  if (session) return session;
  const scopes = new Map<string, Map<string, string>>();
  const listeners = new Set<() => void>();
  const key = (page: Composition) => JSON.stringify([engine.getSnapshot().project.id, page.id]);
  session = {
    read(page, layerId) {
      const id = scopes.get(key(page))?.get(layerId);
      return listLayerMotionOccurrences(page, layerId).some((track) => track.id === id)
        ? id
        : undefined;
    },
    select(page, layerId, trackId) {
      const snapshot = engine.getSnapshot();
      if (
        snapshot.pageId !== page.id ||
        snapshot.project.pages.find((item) => item.id === page.id) !== page
      )
        return;
      if (!listLayerMotionOccurrences(page, layerId).some((track) => track.id === trackId)) return;
      const scope = key(page);
      const selected = scopes.get(scope) ?? new Map<string, string>();
      if (selected.get(layerId) === trackId) return;
      selected.set(layerId, trackId);
      scopes.delete(scope);
      scopes.set(scope, selected);
      while (scopes.size > 32) scopes.delete(scopes.keys().next().value!);
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  sessions.set(engine, session);
  return session;
}

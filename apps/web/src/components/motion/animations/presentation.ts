import { useSyncExternalStore } from "react";
import type { EnginePort } from "@musart/core";

interface Presentation {
  details: boolean;
  selected: string | null;
}
const stores = new WeakMap<EnginePort, ReturnType<typeof createStore>>();
function createStore() {
  let state: Presentation = { details: false, selected: null };
  const listeners = new Set<() => void>();
  return {
    read: () => state,
    subscribe(this: void, listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(patch: Partial<Presentation>) {
      const next = { ...state, ...patch };
      if (next.details === state.details && next.selected === state.selected) return;
      state = next;
      for (const listener of listeners) listener();
    },
  };
}
export function animationPresentation(engine: EnginePort) {
  let store = stores.get(engine);
  if (!store) {
    store = createStore();
    stores.set(engine, store);
  }
  return store;
}
export function useAnimationPresentation(engine: EnginePort) {
  const store = animationPresentation(engine);
  return useSyncExternalStore(store.subscribe, store.read, store.read);
}

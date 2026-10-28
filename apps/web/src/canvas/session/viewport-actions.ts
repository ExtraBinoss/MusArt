import type { EnginePort } from "@musart/core";

export type ViewportAction = "fit" | "reset" | "recenter" | "zoomIn" | "zoomOut";
export interface ViewportActions {
  run: (action: ViewportAction) => boolean;
  subscribe: (listener: (action: ViewportAction) => void) => () => void;
}
const ports = new WeakMap<EnginePort, ViewportActions>();

/** Presentation commands shared by canvas controls and command search. */
export function createViewportActions(engine: EnginePort): ViewportActions {
  const existing = ports.get(engine);
  if (existing) return existing;
  const listeners = new Set<(action: ViewportAction) => void>();
  const port: ViewportActions = {
    run: (action) => {
      const active = [...listeners];
      for (const listener of active) listener(action);
      return active.length > 0;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  ports.set(engine, port);
  return port;
}

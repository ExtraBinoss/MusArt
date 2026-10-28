import type { EnginePort } from "@musart/core";

const ports = new WeakMap<EnginePort, ReturnType<typeof makePort>>();
function makePort() {
  const listeners = new Set<() => void>();
  return {
    open: (): boolean => {
      const active = [...listeners];
      for (const listener of active) listener();
      return active.length > 0;
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
/** Presentation-only opening of the existing shared shapes/icons/brands library. */
export function createLibraryActions(engine: EnginePort) {
  let port = ports.get(engine);
  if (!port) {
    port = makePort();
    ports.set(engine, port);
  }
  return port;
}

import type { EnginePort } from "@musart/core";

export interface ViewportResizeLease {
  apply(): void;
  cancel(): void;
  readonly finished: Promise<void>;
}

const ports = new WeakMap<EnginePort, ReturnType<typeof createPort>>();

function createPort() {
  let owner: { capture: () => ViewportResizeLease | undefined } | null = null;
  return {
    capture: () => owner?.capture(),
    register(next: () => ViewportResizeLease | undefined) {
      const registration = { capture: next };
      owner = registration;
      return () => {
        if (owner === registration) owner = null;
      };
    },
  };
}

/** One mounted canvas owns this transient, engine-scoped layout adapter. */
export function createViewportResizeAnchor(engine: EnginePort) {
  let port = ports.get(engine);
  if (!port) ports.set(engine, (port = createPort()));
  return port;
}

import type { EnginePort } from "@musart/core";
import type { CommandId } from "./model";
import { isCommandId } from "./registry";

type Listener = (id: CommandId) => boolean;
interface CommandPort {
  run: (id: CommandId) => boolean;
  subscribe: (listener: Listener) => () => void;
}
const ports = new WeakMap<EnginePort, CommandPort>();
/** UI command ownership stays with mounted surfaces; global bindings never click hidden DOM controls. */
export function createCommandPort(engine: EnginePort): CommandPort {
  const existing = ports.get(engine);
  if (existing) return existing;
  let current: Listener | null = null;
  const port: CommandPort = {
    run: (id) => isCommandId(id) && (current?.(id) ?? false),
    subscribe: (listener) => {
      current = listener;
      return () => {
        if (current === listener) current = null;
      };
    },
  };
  ports.set(engine, port);
  return port;
}

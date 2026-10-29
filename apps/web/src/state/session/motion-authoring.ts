import type { EnginePort } from "@musart/core";

export interface MotionAuthoring {
  read(this: void): boolean;
  set(this: void, enabled: boolean): void;
  subscribe(this: void, listener: () => void): () => void;
}
const sessions = new WeakMap<EnginePort, MotionAuthoring>();

/** Explicit Auto-keyframe capture state; it never changes document/base values by itself. */
export function getMotionAuthoring(engine: EnginePort): MotionAuthoring {
  let session = sessions.get(engine);
  if (!session) {
    let enabled = false;
    const listeners = new Set<() => void>();
    session = {
      read: () => enabled,
      set(next) {
        if (next === enabled) return;
        enabled = next;
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
  }
  return session;
}

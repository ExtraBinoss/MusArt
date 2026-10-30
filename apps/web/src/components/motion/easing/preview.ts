import type { MotionEasing } from "@musart/core";
import { sameEasing } from "./model";

/** Local, disposable-by-unsubscription hover state; it never edits the authored draft. */
export function createEasingPreview() {
  let value: MotionEasing | null = null;
  const listeners = new Set<() => void>();
  return {
    read: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next: MotionEasing | null) => {
      if (next === null ? value === null : value !== null && sameEasing(value, next)) return;
      value = next === null ? null : Object.freeze({ ...next });
      for (const listener of listeners) listener();
    },
  };
}
export type EasingPreview = ReturnType<typeof createEasingPreview>;

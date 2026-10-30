import type { TransitionStyle } from "@musart/core";

/** Preset browsing is a leaf-only UI value, separate from the selected authored style. */
export function createTransitionPreviewSource() {
  let value: TransitionStyle | null = null;
  const listeners = new Set<() => void>();
  return {
    read: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next: TransitionStyle | null) => {
      if (value === next) return;
      value = next;
      for (const listener of listeners) listener();
    },
  };
}
export type TransitionPreviewSource = ReturnType<typeof createTransitionPreviewSource>;

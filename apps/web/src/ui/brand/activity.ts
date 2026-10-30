import type { BrandActivity } from "./playback";
/** A real operation can drive an SVG leaf imperatively without publishing React frames. */
export function createBrandActivity(initial = false) {
  let active = initial,
    disposed = false;
  const listeners = new Set<() => void>();
  function set(next: boolean) {
    if (disposed || next === active) return;
    active = next;
    for (const listener of listeners) listener();
  }
  return {
    read: () => active,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set,
    dispose() {
      if (disposed) return;
      disposed = true;
      const changed = active;
      active = false;
      try {
        if (changed) for (const listener of listeners) listener();
      } finally {
        listeners.clear();
      }
    },
  } satisfies BrandActivity & { set(active: boolean): void; dispose(): void };
}

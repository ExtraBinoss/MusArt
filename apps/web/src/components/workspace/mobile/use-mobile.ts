import { createContext, useMemo, useSyncExternalStore } from "react";

export const MobileControlsContext = createContext(false);
/** A viewport breakpoint, independent of document and gesture state. */
export function useMobileLayout() {
  const media = useMemo(() => matchMedia("(max-width: 767px)"), []);
  return useSyncExternalStore(
    (changed) => {
      media.addEventListener("change", changed);
      return () => media.removeEventListener("change", changed);
    },
    () => media.matches,
    () => false,
  );
}

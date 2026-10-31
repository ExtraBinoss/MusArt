import { useCallback, useEffect, useRef } from "react";
import { getUiPresentation } from "../../../state/session/ui-presentation";

/** Acquire before an opening callback can select a target and publish sibling work. */
export function useOverlayEntrance(onOpenChange?: (open: boolean) => void) {
  const release = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => release.current?.(), []);
  return useCallback(
    (open: boolean) => {
      const previous = release.current;
      release.current = open ? getUiPresentation().hold() : undefined;
      previous?.();
      onOpenChange?.(open);
    },
    [onOpenChange],
  );
}

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

function createMeasurementLease(ownerKey: string) {
  let live = true;
  return {
    ownerKey,
    activate() {
      live = true;
    },
    retire() {
      live = false;
    },
    isLive() {
      return live;
    },
  };
}

/** Stable owner geometry keeps sibling triggers clear; closed Radix content requests no layout reads. */
export function useLayerPopoverAnchor(ownerKey: string) {
  const current = useRef<HTMLButtonElement | null>(null);
  const [node, setNode] = useState<HTMLButtonElement | null>(null);
  const trigger = useCallback(
    (next: HTMLButtonElement | null) => {
      current.current = next;
      setNode((previous) => (previous === next ? previous : next));
    },
    [setNode],
  );
  const lease = useMemo(() => createMeasurementLease(ownerKey), [ownerKey]);
  useLayoutEffect(() => {
    lease.activate();
    return () => lease.retire();
  }, [lease]);
  const virtualRef = useMemo(() => {
    function element() {
      const button = lease.isLive() ? (current.current ?? node) : null;
      if (!button?.isConnected) return undefined;
      return button.closest<HTMLElement>(".layer-row, .layer-attachment-row") ?? button;
    }
    return {
      current: {
        get contextElement() {
          return element();
        },
        getBoundingClientRect() {
          // Child layout effects can measure before the owner's layout effect runs.
          return element()?.getBoundingClientRect() ?? new DOMRect();
        },
      },
    };
  }, [lease, node]);
  return { trigger, virtualRef };
}

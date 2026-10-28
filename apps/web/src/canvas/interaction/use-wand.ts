import { useCallback, useEffect, useRef } from "react";
import type { createStore } from "jotai";
import type { PixelSelectionPort } from "../../services/selection/wand/model";
import {
  selectionContiguousAtom,
  selectionModeAtom,
  toleranceAtom,
} from "../../state/session/editor";
import { formatUiError } from "../../state/i18n/errors/format";
interface Pointer {
  clientX: number;
  shiftKey: boolean;
  altKey: boolean;
}
interface Active {
  start: number;
  tolerance: number;
  latest: number;
  ready: Promise<void>;
  token: number;
}
/** Pointer movement updates only the worker port and retained SVG, never document/React state. */
export function useWand({
  port,
  store,
  tool,
  onError,
}: {
  port?: PixelSelectionPort;
  store: ReturnType<typeof createStore>;
  tool: string;
  onError?: (message: string) => void;
}) {
  const active = useRef<Active | null>(null),
    finishing = useRef<Active | null>(null),
    version = useRef(0);
  function report(error: unknown, token: number) {
    if (version.current !== token) return;
    version.current++;
    active.current = null;
    finishing.current = null;
    if (error instanceof DOMException && error.name === "AbortError") return;
    port?.deselect();
    onError?.(formatUiError(error));
  }
  const cancel = useCallback(() => {
    version.current++;
    if (active.current || finishing.current) port?.cancel();
    active.current = null;
    finishing.current = null;
  }, [port]);
  useEffect(
    () => () => {
      version.current++;
      if (active.current || finishing.current) port?.cancel();
      active.current = null;
      finishing.current = null;
    },
    [port, tool],
  );
  return {
    active: () => active.current !== null,
    begin(event: Pointer, layerId: string, x: number, y: number) {
      if (!port) return false;
      cancel();
      const token = ++version.current,
        tolerance = store.get(toleranceAtom),
        mode = event.altKey ? "subtract" : event.shiftKey ? "add" : store.get(selectionModeAtom),
        ready = port.begin(layerId, x, y, tolerance, mode, store.get(selectionContiguousAtom));
      active.current = { start: event.clientX, tolerance, latest: tolerance, ready, token };
      void ready.catch((error) => report(error, token));
      return true;
    },
    move(event: Pick<Pointer, "clientX">) {
      const gesture = active.current;
      if (!gesture || !port) return;
      const value = Math.max(
        0,
        Math.min(255, Math.round(gesture.tolerance + (event.clientX - gesture.start) / 2)),
      );
      if (gesture.latest === value) return;
      gesture.latest = value;
      if (port.read()?.dragging)
        void port.update(value).catch((error) => report(error, gesture.token));
    },
    finish() {
      const gesture = active.current;
      if (!gesture || !port) return;
      active.current = null;
      finishing.current = gesture;
      void (async () => {
        await gesture.ready;
        if (version.current !== gesture.token) return;
        await port.update(gesture.latest);
        if (version.current !== gesture.token) return;
        await port.accept();
        if (version.current === gesture.token) store.set(toleranceAtom, gesture.latest);
      })()
        .catch((error) => report(error, gesture.token))
        .finally(() => {
          if (finishing.current === gesture) finishing.current = null;
        });
    },
    cancel,
    escape() {
      if (active.current || finishing.current) cancel();
      else {
        version.current++;
        port?.deselect();
      }
    },
  };
}

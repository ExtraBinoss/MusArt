import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type DragEvent,
} from "react";
import { useStore } from "jotai";
import type { SearchItem } from "../../search/catalog/model";
import { DeferredDragSession, setDragCueAnchor } from "../../shared/dnd/session";
import { createDragDiagnostics } from "../../shared/dnd/diagnostics";
import { dockCommandsAtom, moveDockCommand } from "./preferences";
const MIME = "application/x-musart-dock-command";
interface Origin {
  id: string;
  ids: readonly string[];
  scope: string;
  target: { id: string; position: "before" | "after" } | null;
}
/** Destination-only adapter for the shared deferred drag engine. */
export function useDockDrag(ids: readonly string[], commands: readonly SearchItem[]) {
  const store = useStore();
  const scope = JSON.stringify(commands.map((command) => command.id));
  const session = useMemo(() => new DeferredDragSession<Origin>(), []);
  const diagnostics = useMemo(createDragDiagnostics, []);
  const source = useSyncExternalStore(session.subscribe, session.read, session.read);
  const anchor = useRef<HTMLElement | null>(null);
  const cancel = useCallback(() => {
    session.cancel();
    anchor.current = null;
  }, [session]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    const outside = (event: globalThis.DragEvent) => {
      if (!session.read()) return;
      if (!(event.target instanceof Element) || !event.target.closest("[data-dock-command]")) {
        setDragCueAnchor(null);
        anchor.current = null;
        session.publish({ ...session.read()!, target: null });
        if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
        diagnostics.refuse("nativeDragover", "nonDockTarget", undefined, event);
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("dragover", outside);
    window.addEventListener("dragend", cancel);
    window.addEventListener("pagehide", cancel);
    return () => {
      cancel();
      window.removeEventListener("keydown", key);
      window.removeEventListener("dragover", outside);
      window.removeEventListener("dragend", cancel);
      window.removeEventListener("pagehide", cancel);
    };
  }, [session, diagnostics, cancel]);
  useEffect(() => {
    cancel();
  }, [ids, scope, cancel]);
  function current(origin: Origin) {
    return (
      origin.ids === ids && origin.ids === store.get(dockCommandsAtom) && origin.scope === scope
    );
  }
  const active = source && current(source) ? source : null;
  return {
    ids,
    dragging: active?.id ?? null,
    target: active?.target ?? null,
    anchor,
    cancel,
    start(event: DragEvent<HTMLElement>, id: string) {
      diagnostics.begin({ mode: "dock", input: "native", sourceId: id });
      if (
        store.get(dockCommandsAtom) !== ids ||
        !ids.includes(id) ||
        !commands.some((command) => command.id === id)
      ) {
        event.preventDefault();
        diagnostics.refuse("begin", "sourceRejected", id, event);
        cancel();
        return;
      }
      session.begin(cancel);
      session.publish({ id, ids, scope, target: null });
      try {
        event.dataTransfer.setData(MIME, id);
        event.dataTransfer.effectAllowed = "move";
      } catch (error) {
        cancel();
        event.preventDefault();
        throw error;
      }
    },
    over(event: DragEvent<HTMLElement>, id: string) {
      const origin = session.read();
      if (!origin) return;
      if (!current(origin) || !ids.includes(id)) {
        event.dataTransfer.dropEffect = "none";
        diagnostics.refuse("nativeDragover", "staleOrMissingTarget", id, event);
        cancel();
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const bounds = event.currentTarget.getBoundingClientRect();
      const y = Number.isFinite(event.clientY) ? event.clientY : 0;
      const position = y >= bounds.top + bounds.height / 2 ? "after" : "before";
      anchor.current = id === origin.id ? null : event.currentTarget;
      setDragCueAnchor(anchor.current);
      const target = id === origin.id ? null : ({ id, position } as const);
      if (origin.target?.id !== target?.id || origin.target?.position !== target?.position)
        session.publish({ ...origin, target });
    },
    overViewport(this: void, event: DragEvent<HTMLElement>) {
      if (
        session.read()?.target &&
        event.target instanceof Element &&
        event.target.closest("[data-dock-command]")
      ) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }
    },
    drop(event: DragEvent<HTMLElement>): boolean {
      event.preventDefault();
      event.stopPropagation();
      const origin = session.read();
      if (
        !origin ||
        !current(origin) ||
        event.dataTransfer.getData(MIME) !== origin.id ||
        !origin.target
      ) {
        diagnostics.refuse("drop", "noAcceptedTargetOrStaleSource", origin?.target?.id, event);
        cancel();
        return false;
      }
      const target = ids.filter((id) => id !== origin.id).indexOf(origin.target.id);
      const next = moveDockCommand(
        ids,
        origin.id,
        target + (origin.target.position === "after" ? 1 : 0),
      );
      const changed = next.some((id, at) => id !== ids[at]);
      return session.finish(changed, (placed) => {
        store.set(dockCommandsAtom, next);
        const committed = store.get(dockCommandsAtom);
        placed({
          targets: () =>
            [...document.querySelectorAll<HTMLElement>("[data-dock-command]")].filter(
              (node) => node.dataset.dockCommand === origin.id,
            ),
          isCurrent: () => store.get(dockCommandsAtom) === committed,
          subscribe: (listener) => store.sub(dockCommandsAtom, listener),
        });
      });
    },
  };
}

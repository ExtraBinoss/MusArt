import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { EnginePort } from "@musart/core";
import {
  getFontPresentation,
  type FontRenderInput,
  type FontRenderState,
  type FontRenderTicket,
} from "../../../state/session/font-presentation";

const EMPTY: FontRenderState = Object.freeze({ available: false, ticket: null, status: "idle" });
const readEmpty = () => EMPTY;
const subscribeEmpty = () => () => undefined;
interface Owned {
  ticket: FontRenderTicket;
  label: string;
  kind: "preview" | "commit";
  scope: symbol;
}

/** Browser FontFace readiness and the renderer's genuine post-draw acknowledgment stay separate. */
export function useFontCanvasStatus(engine?: EnginePort) {
  const port = useMemo(() => (engine ? getFontPresentation(engine) : undefined), [engine]);
  const scope = useMemo(
    () => Symbol(port ? "font-preview-owner" : "font-preview-no-engine"),
    [port],
  );
  const lifecycle = useRef({ scope, alive: false });
  const [owned, setOwned] = useState<Owned | null>(null);
  const current = useRef<Owned | null>(null);
  const state = useSyncExternalStore(
    port?.subscribe ?? subscribeEmpty,
    port?.read ?? readEmpty,
    readEmpty,
  );
  const request = useCallback(
    (input: FontRenderInput, label: string, kind: Owned["kind"]) => {
      if (!port || !lifecycle.current.alive || lifecycle.current.scope !== scope) return;
      const next = { ticket: port.request(input), label, kind, scope };
      current.current = next;
      setOwned(next);
    },
    [port, scope],
  );
  const cancel = useCallback(
    (previewOnly = false) => {
      const owned = current.current;
      if (
        !lifecycle.current.alive ||
        lifecycle.current.scope !== scope ||
        !owned ||
        owned.scope !== scope ||
        (previewOnly && owned.kind !== "preview")
      )
        return;
      port?.cancel(owned.ticket);
      current.current = null;
      setOwned(null);
    },
    [port, scope],
  );
  useLayoutEffect(() => {
    lifecycle.current = { scope, alive: true };
    return () => {
      if (lifecycle.current.scope === scope) lifecycle.current = { scope, alive: false };
      if (current.current?.scope === scope) {
        port?.cancel(current.current.ticket);
        current.current = null;
      }
    };
  }, [port, scope]);
  return {
    request,
    cancel,
    view: owned && state.ticket === owned.ticket ? { ...state, label: owned.label } : undefined,
  };
}

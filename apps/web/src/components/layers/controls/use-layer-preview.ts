import { useCallback, useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import {
  type Command,
  type Composition,
  type EnginePort,
  type Layer,
  type SessionSnapshot,
} from "@musart/core";
import { previewAtom } from "../../../state/session/editor";
import { layerSelection } from "../menu/selection";
interface Session {
  snapshot: SessionSnapshot | null;
  ids: string[];
  selection: string[] | null;
}
/** Keeps live layer drafts outside React and binds the completed gesture to its original document. */
export function useLayerPreview(
  engine: EnginePort,
  page: Composition,
  ids: readonly string[],
  run: (task: () => void) => void,
  requireSelection = false,
) {
  const setPreview = useSetAtom(previewAtom);
  const held = useRef<Session | null>(null);
  const current = useCallback(
    (session: Session) => {
      if (!session.snapshot) return false;
      const snapshot = engine.getSnapshot();
      const sameSelection = snapshot.selection === session.snapshot.selection;
      const selection = session.selection && !sameSelection ? new Set(snapshot.selection) : null;
      return (
        snapshot.project === session.snapshot.project &&
        snapshot.pageId === session.snapshot.pageId &&
        snapshot.revision === session.snapshot.revision &&
        (!session.selection ||
          sameSelection ||
          (snapshot.selection.length === session.selection.length &&
            session.selection.every((id) => selection!.has(id))))
      );
    },
    [engine],
  );
  const cancel = useCallback(() => {
    held.current = null;
    setPreview(null);
  }, [setPreview]);
  useEffect(() => {
    const stop = engine.subscribe(() => {
      if (held.current && !current(held.current)) setPreview(null);
    });
    return () => {
      stop();
      setPreview(null);
    };
  }, [engine, current, setPreview]);
  function begin() {
    if (held.current) return;
    const snapshot = engine.getSnapshot(),
      active = snapshot.project.pages.find((item) => item.id === snapshot.pageId);
    const state = active === page ? layerSelection(active, ids) : null;
    const editable = state?.editable && state.selected.length === ids.length;
    const selection = new Set(snapshot.selection);
    const selected =
      !requireSelection ||
      (snapshot.selection.length === ids.length && ids.every((id) => selection.has(id)));
    held.current = {
      snapshot: editable && selected ? snapshot : null,
      ids: [...ids],
      selection: requireSelection ? [...ids] : null,
    };
  }
  function preview(patch: Partial<Layer>) {
    begin();
    const session = held.current!;
    if (current(session)) setPreview({ target: "layers", layerIds: session.ids, patch });
    else setPreview(null);
  }
  function command(make: (session: Session) => Command) {
    begin();
    const session = held.current!;
    const valid = current(session);
    cancel();
    if (valid)
      run(() => {
        if (current(session)) engine.execute(make(session));
      });
  }
  return {
    begin,
    cancel,
    preview,
    command: (value: Command) => command(() => value),
    commit: (patch: Partial<Layer>) =>
      command((session) => ({ type: "updateLayers", ids: session.ids, patch })),
  };
}

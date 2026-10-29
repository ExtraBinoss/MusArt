import { useCallback, useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import {
  type Command,
  type Composition,
  type EnginePort,
  type Layer,
  type Effect,
  type MotionPropertyTarget,
  type SessionSnapshot,
} from "@musart/core";
import { previewAtom } from "../../../state/session/editor";
import { layerSelection } from "../menu/selection";
import {
  captureMotionEdit,
  isMotionEditCurrent,
  motionLayerCommands,
  motionPreviewPatch,
  motionTimeChanges,
  motionTargetKey,
  type MotionEditOrigin,
  type MotionEditTarget,
  type MotionEffectIntent,
} from "../../../state/session/motion-edit";
interface Session {
  snapshot: SessionSnapshot | null;
  ids: string[];
  selection: string[] | null;
  motion: MotionEditOrigin;
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
        isMotionEditCurrent(engine, session.motion) &&
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
    const stopClock = motionTimeChanges(engine).subscribe(() => {
      if (held.current && !current(held.current)) setPreview(null);
    });
    return () => {
      stop();
      stopClock();
      setPreview(null);
    };
  }, [engine, current, setPreview]);
  function beginOnPage(originPage: Composition, target?: MotionEditTarget) {
    if (held.current) return;
    const motion = captureMotionEdit(engine, target),
      snapshot = motion.snapshot,
      active = snapshot.project.pages.find((item) => item.id === snapshot.pageId);
    const state = active === originPage ? layerSelection(active, ids) : null;
    const editable = state?.editable && state.selected.length === ids.length;
    const selection = new Set(snapshot.selection);
    const selected =
      !requireSelection ||
      (snapshot.selection.length === ids.length && ids.every((id) => selection.has(id)));
    held.current = {
      snapshot: editable && selected ? snapshot : null,
      ids: [...ids],
      selection: requireSelection ? [...ids] : null,
      motion,
    };
  }
  function begin(target?: MotionEditTarget) {
    beginOnPage(page, target);
  }
  function start(target?: MotionEditTarget) {
    const targets: readonly MotionPropertyTarget[] = target
      ? Array.isArray(target)
        ? target
        : [target as MotionPropertyTarget]
      : [];
    if (
      held.current &&
      (!current(held.current) ||
        JSON.stringify(held.current.motion.targets?.map(motionTargetKey) ?? []) !==
          JSON.stringify(targets.map(motionTargetKey)))
    )
      cancel();
    begin(target);
  }
  function preview(patch: Partial<Layer>, intent?: MotionEffectIntent, single = false) {
    begin();
    const session = held.current!;
    if (current(session)) {
      const next = motionPreviewPatch(engine, session.motion, session.ids, patch, intent);
      setPreview(
        single && session.ids.length === 1
          ? { target: "layer", layerId: session.ids[0]!, patch: next }
          : { target: "layers", layerIds: session.ids, patch: next },
      );
    } else setPreview(null);
  }
  function command(make: (session: Session) => Command | Command[]) {
    begin();
    const session = held.current!;
    const valid = current(session);
    cancel();
    if (valid)
      run(() => {
        if (current(session)) {
          const commands = make(session);
          if (Array.isArray(commands)) {
            if (commands.length === 1) engine.execute(commands[0]!);
            else if (commands.length) engine.transaction(commands);
          } else engine.execute(commands);
        }
      });
  }
  function effectPatch(effectId: string, patch: Partial<Effect>): Partial<Layer> {
    const layer = page.layers.find((item) => item.id === ids[0]);
    return {
      effects:
        layer?.effects.map((effect) => {
          if (effect.id !== effectId) return effect;
          const next = { ...effect, ...patch };
          if ("composite" in patch && patch.composite === undefined) delete next.composite;
          return next;
        }) ?? [],
    };
  }
  return {
    begin,
    start,
    beginOnPage,
    cancel,
    preview,
    previewLayer: (patch: Partial<Layer>) => preview(patch, undefined, true),
    command: (value: Command) => command(() => value),
    commit: (patch: Partial<Layer>) =>
      command((session) => motionLayerCommands(engine, session.motion, session.ids, patch)),
    previewEffect: (effectId: string, patch: Partial<Effect>) =>
      preview(effectPatch(effectId, patch), { effectId, patch }),
    commitEffect: (effectId: string, patch: Partial<Effect>) =>
      command((session) =>
        motionLayerCommands(engine, session.motion, session.ids, effectPatch(effectId, patch), {
          effectId,
          patch,
        }),
      ),
  };
}

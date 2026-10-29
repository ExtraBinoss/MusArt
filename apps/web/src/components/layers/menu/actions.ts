import {
  createEffect,
  type Composition,
  type EnginePort,
  type EffectType,
  type Command,
} from "@musart/core";
import { layerSelection } from "./selection";
import { capturePresentationDelete } from "../../../state/selection/attachments";
import { resolveLayerPage } from "../tree/activation";
/** Menu operations always re-read the active selection and reject a stale page before execution. */
export function layerActions(
  engine: EnginePort,
  page: Composition,
  run: (task: () => void) => void,
) {
  function execute(make: (ids: string[], page: Composition) => Command[]) {
    const origin = engine.getSnapshot(),
      active = resolveLayerPage(engine, page);
    if (
      !active ||
      origin.pageId !== active.id ||
      !layerSelection(active, origin.selection).editable
    )
      return;
    const ids = [...origin.selection];
    run(() => {
      const snapshot = engine.getSnapshot();
      const currentIds = new Set(snapshot.selection);
      if (
        snapshot.project !== origin.project ||
        snapshot.pageId !== origin.pageId ||
        snapshot.revision !== origin.revision ||
        snapshot.selection.length !== ids.length ||
        ids.some((id) => !currentIds.has(id))
      )
        return;
      const commands = make(ids, active);
      if (commands.length) engine.transaction(commands);
    });
  }
  return {
    group: () => execute((ids) => [{ type: "groupLayers", ids }]),
    ungroup: () => execute((ids) => [{ type: "ungroupLayers", ids }]),
    duplicate: () => execute((ids) => [{ type: "duplicateLayers", ids }]),
    remove: () => {
      const snapshot = engine.getSnapshot();
      const active = resolveLayerPage(engine, page);
      if (
        !active ||
        snapshot.pageId !== active.id ||
        !layerSelection(active, snapshot.selection).editable
      )
        return;
      run(capturePresentationDelete(engine));
    },
    mask: () => execute((ids) => [{ type: "createMaskFromSelection", ids }]),
    effect: (type: EffectType) =>
      execute((ids, current) => {
        const selected = new Set(ids);
        return [
          {
            type: "updateLayerPatches",
            patches: current.layers
              .filter((layer) => selected.has(layer.id))
              .map((layer) => ({
                id: layer.id,
                patch: { effects: [...layer.effects, createEffect(type)] },
              })),
          },
        ];
      }),
  };
}

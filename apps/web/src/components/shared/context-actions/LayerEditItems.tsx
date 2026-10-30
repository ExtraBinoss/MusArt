import {
  Copy,
  ClipboardPaste,
  CopyPlus,
  FolderPlus,
  Ungroup,
  ScanLine,
  Eye,
  EyeOff,
  LockKeyhole,
  LockKeyholeOpen,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Composition, EnginePort } from "@musart/core";
import { ContextMenuItem, ContextMenuSeparator } from "../../ui/context-menu";
import { DropdownMenuItem, DropdownMenuSeparator } from "../../ui/dropdown-menu";
import { layerActions } from "../../layers/menu/actions";
import { layerSelection } from "../../layers/menu/selection";
import { blockingLocks, captureUnlock } from "../../properties/locked/unlock";
import { createClipboardController } from "../../../services/clipboard/controller";
import "./messages";

/** Common layer actions keep the canvas and tree menus on the same validated domain paths. */
export function LayerEditItems({
  engine,
  page,
  selection,
  run,
  current,
  disabled = false,
  surface = "context",
}: {
  engine: EnginePort;
  page: Composition;
  selection: string[];
  run: (action: () => void) => void;
  current: () => boolean;
  disabled?: boolean;
  surface?: "context" | "dropdown";
}) {
  const { t } = useTranslation("objectMenu");
  const { t: common } = useTranslation();
  const Item = surface === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator = surface === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const state = layerSelection(page, selection),
    actions = layerActions(engine, page, guarded);
  const locked = blockingLocks(page, selection).length > 0;
  const visible = state.selected.every((layer) => layer.visible);
  function guarded(action: () => void) {
    if (!disabled && current())
      run(() => {
        if (current()) action();
      });
  }
  function clipboard(kind: "copy" | "paste") {
    guarded(() => {
      void createClipboardController(engine)
        [kind]()
        .catch((error) =>
          run(() => {
            throw error;
          }),
        );
    });
  }
  return (
    <>
      <Item disabled={disabled || !selection.length} onSelect={() => clipboard("copy")}>
        <Copy size={14} />
        {t("copy")}
      </Item>
      <Item disabled={disabled} onSelect={() => clipboard("paste")}>
        <ClipboardPaste size={14} />
        {t("paste")}
      </Item>
      <Item disabled={disabled || !state.editable} onSelect={actions.duplicate}>
        <CopyPlus size={14} />
        {common("duplicateLayer")}
      </Item>
      <Separator />
      <Item
        disabled={disabled || (state.ungroup ? !state.canUngroup : !state.canGroup)}
        onSelect={state.ungroup ? actions.ungroup : actions.group}
      >
        {state.ungroup ? <Ungroup size={14} /> : <FolderPlus size={14} />}
        {common(state.ungroup ? "ungroupLayers" : "groupLayers")}
      </Item>
      {selection.length > 1 && (
        <Item disabled={disabled || !state.editable} onSelect={actions.mask}>
          <ScanLine size={14} />
          {common("createMask")}
        </Item>
      )}
      <Separator />
      <Item
        disabled={disabled || !state.editable}
        onSelect={() =>
          guarded(() =>
            engine.execute({ type: "updateLayers", ids: selection, patch: { visible: !visible } }),
          )
        }
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        {t(visible ? "hide" : "show")}
      </Item>
      <Item
        disabled={disabled || !selection.length}
        onSelect={() =>
          guarded(() => {
            if (locked) captureUnlock(engine, page, selection)();
            else engine.execute({ type: "updateLayers", ids: selection, patch: { locked: true } });
          })
        }
      >
        {locked ? <LockKeyholeOpen size={14} /> : <LockKeyhole size={14} />}
        {t(locked ? "unlock" : "lock")}
      </Item>
    </>
  );
}

import { memo, useRef } from "react";
import { Blend, FolderPlus, Ungroup, Copy, Trash2, ScanLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Composition, EnginePort } from "@musart/core";
import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "../../ui/context-menu";
import { layerSelection } from "./selection";
import { layerActions } from "./actions";
import "../messages";
import { attachmentSelection } from "../../../state/selection/attachments";
import { useAttachmentSelection } from "../../../state/selection/use-attachment-selection";
import { sameSelectionAvailability } from "./availability";
import { requestLayerTransition, getTransitionRequests } from "../../motion/transitions/requests";
import "../../motion/transitions/messages";
export const LayerContext = memo(function LayerContext({
  engine,
  page,
  selection,
  run,
}: {
  engine: EnginePort;
  page: Composition;
  selection: string[];
  run: (task: () => void) => void;
}) {
  const { t } = useTranslation();
  const origin = useRef<ReturnType<EnginePort["getSnapshot"]> | null>(null);
  const attachment = useAttachmentSelection(engine);
  const state = layerSelection(page, selection),
    actions = layerActions(engine, page, run);
  const GroupIcon = state.ungroup ? Ungroup : FolderPlus;
  return (
    <>
      <ContextMenuContent
        portalContainer={document.body}
        onFocusCapture={() => {
          origin.current ??= engine.getSnapshot();
        }}
        onCloseAutoFocus={(event) => {
          origin.current = null;
          if (getTransitionRequests(engine).read()) event.preventDefault();
        }}
      >
        <ContextMenuItem
          disabled={Boolean(attachment) || !state.editable || selection.length !== 1}
          onSelect={() => {
            const snapshot = engine.getSnapshot(),
              id = snapshot.selection.length === 1 ? snapshot.selection[0] : undefined;
            if (
              snapshot.project !== origin.current?.project ||
              snapshot.revision !== origin.current.revision
            )
              return;
            if (id)
              void requestLayerTransition(engine, snapshot.pageId, id).catch((error: unknown) =>
                run(() => {
                  throw error;
                }),
              );
          }}
        >
          <Blend size={14} />
          {t("transitions:add")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={Boolean(attachment) || (state.ungroup ? !state.canUngroup : !state.canGroup)}
          onSelect={state.ungroup ? actions.ungroup : actions.group}
        >
          <GroupIcon size={14} />
          {t(state.ungroup ? "ungroupLayers" : "groupLayers")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!state.editable || Boolean(attachment)}
          onSelect={actions.duplicate}
        >
          <Copy size={14} />
          {t("duplicateLayer")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!state.editable || selection.length < 2 || Boolean(attachment)}
          onSelect={actions.mask}
        >
          <ScanLine size={14} />
          {t("createMask")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={attachment ? !attachmentSelection(engine).editable() : !state.editable}
          variant="destructive"
          onSelect={actions.remove}
        >
          <Trash2 size={14} />
          {attachment
            ? t(attachment.kind === "effect" ? "removeEffect" : "removeMask")
            : t("layerControls:deleteSelection", { count: selection.length })}
        </ContextMenuItem>
      </ContextMenuContent>
    </>
  );
}, sameSelectionAvailability);

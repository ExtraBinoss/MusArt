import { LayerEditItems } from "../../shared/context-actions/LayerEditItems";
import { memo } from "react";
import { Blend, Trash2 } from "lucide-react";
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
export const LayerContext = memo(
  function LayerContext({
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
    const attachment = useAttachmentSelection(engine);
    const state = layerSelection(page, selection),
      actions = layerActions(engine, page, guarded);
    function current() {
      const snapshot = engine.getSnapshot();
      return (
        snapshot.project.pages.find((item) => item.id === page.id) === page &&
        snapshot.pageId === page.id &&
        snapshot.selection.length === selection.length &&
        selection.every((id) => snapshot.selection.includes(id))
      );
    }
    function guarded(action: () => void) {
      if (current())
        run(() => {
          if (current()) action();
        });
    }
    return (
      <>
        <ContextMenuContent
          portalContainer={document.body}
          onCloseAutoFocus={(event) => {
            if (getTransitionRequests(engine).read()) event.preventDefault();
          }}
        >
          <ContextMenuItem
            disabled={Boolean(attachment) || !state.editable || selection.length !== 1}
            onSelect={() => {
              const snapshot = engine.getSnapshot(),
                id = snapshot.selection.length === 1 ? snapshot.selection[0] : undefined;
              if (!current()) return;
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
          <LayerEditItems
            engine={engine}
            page={page}
            selection={selection}
            current={current}
            run={run}
            disabled={Boolean(attachment)}
          />
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
  },
  (before, after) =>
    before.page === after.page &&
    sameSelectionAvailability(before, after) &&
    before.selection.every((id, index) => id === after.selection[index]),
);

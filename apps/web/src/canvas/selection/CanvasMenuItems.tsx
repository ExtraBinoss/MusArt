import { Sparkles, ClipboardPaste, MousePointer2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Composition, EnginePort } from "@musart/core";
import { DropdownMenuItem, DropdownMenuSeparator } from "../../components/ui/dropdown-menu";
import { LayerEditItems } from "../../components/shared/context-actions/LayerEditItems";
import { layerActions } from "../../components/layers/menu/actions";
import { layerSelection } from "../../components/layers/menu/selection";
import { createClipboardController } from "../../services/clipboard/controller";
import "../../components/shared/context-actions/messages";
import "../../components/motion/animations/messages";

export function CanvasMenuItems({
  engine,
  page,
  selection,
  layerId,
  current,
  motion,
  onError,
}: {
  engine: EnginePort;
  page: Composition;
  selection: string[];
  layerId?: string;
  current: () => boolean;
  motion: () => void;
  onError?: (message: string) => void;
}) {
  const { t } = useTranslation("objectMenu");
  const { t: animation } = useTranslation("animations");
  function run(action: () => void) {
    if (!current()) return;
    try {
      action();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    }
  }
  if (!layerId)
    return (
      <>
        <DropdownMenuItem
          onSelect={() =>
            run(() => {
              void createClipboardController(engine)
                .paste()
                .catch((error) =>
                  onError?.(error instanceof Error ? error.message : String(error)),
                );
            })
          }
        >
          <ClipboardPaste size={14} />
          {t("paste")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!page.layers.length}
          onSelect={() => run(() => engine.select(page.layers.map((layer) => layer.id)))}
        >
          <MousePointer2 size={14} />
          {t("selectAll")}
        </DropdownMenuItem>
      </>
    );
  const state = layerSelection(page, selection);
  const actions = layerActions(engine, page, run);
  return (
    <>
      <DropdownMenuItem disabled={!state.editable || selection.length !== 1} onSelect={motion}>
        <Sparkles size={14} />
        {animation("add")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <LayerEditItems
        engine={engine}
        page={page}
        selection={selection}
        current={current}
        run={run}
        surface="dropdown"
      />
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" disabled={!state.editable} onSelect={actions.remove}>
        <Trash2 size={14} />
        {t("remove")}
      </DropdownMenuItem>
    </>
  );
}

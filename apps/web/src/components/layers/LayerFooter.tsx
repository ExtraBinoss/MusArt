import { memo, useCallback, useMemo, useRef } from "react";
import { Plus, ScanLine } from "lucide-react";
import type { Composition, EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { attachmentSelection, type AttachmentTarget } from "../../state/selection/attachments";
import { useRenderMetrics } from "../../state/session/render-metrics";
import { IconButton } from "../shared/IconButton";
import { EffectMenu } from "./EffectMenu";
import { LayerMenu } from "./LayerMenu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { layerActions } from "./menu/actions";
import { layerSelection } from "./menu/selection";
import { sameSelectionAvailability } from "./menu/availability";

export const LayerFooter = memo(
  function LayerFooter({
    engine,
    page,
    selection,
    run,
    attachment,
  }: {
    engine: EnginePort;
    page: Composition;
    selection: string[];
    run: (action: () => void) => void;
    attachment: AttachmentTarget | null;
  }) {
    const { t } = useTranslation();
    const element = useRef<HTMLDivElement>(null);
    useRenderMetrics(element);
    const state = layerSelection(page, selection);
    const runCurrent = useCallback(
      (task: () => void) => {
        const port = attachmentSelection(engine),
          target = port.read();
        run(() => {
          if (port.read() === target) task();
        });
      },
      [engine, run],
    );
    const actions = useMemo(
      () => layerActions(engine, page, runCurrent),
      [engine, page, runCurrent],
    );
    return (
      <div
        ref={element}
        className="layers-footer layers-header-actions"
        role="group"
        aria-label={t("layerControls:actions")}
      >
        <div
          className="layer-create-actions"
          role="group"
          aria-label={t("layerControls:createActions")}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label={t("layerControls:add")} disabled={!state.editable}>
                <Plus size={15} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <EffectMenu onAdd={actions.effect} />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!state.editable || selection.length < 2 || Boolean(attachment)}
                onSelect={() => {
                  if (
                    !attachmentSelection(engine).read() &&
                    engine.getSnapshot().selection.length >= 2
                  )
                    actions.mask();
                }}
              >
                <ScanLine size={14} />
                {t("createMask")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div
          className="layer-selection-actions"
          role="group"
          aria-label={t("layerControls:selectionActions")}
        >
          <LayerMenu engine={engine} page={page} selection={selection} run={runCurrent} />
        </div>
      </div>
    );
  },
  (before, after) =>
    before.attachment === after.attachment && sameSelectionAvailability(before, after),
);

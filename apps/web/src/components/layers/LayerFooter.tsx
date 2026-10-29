import { memo, useCallback, useMemo, useRef } from "react";
import { Copy, Trash2 } from "lucide-react";
import type { Composition, EnginePort } from "@musart/core";
import { useTranslation } from "react-i18next";
import { attachmentSelection, type AttachmentTarget } from "../../state/selection/attachments";
import { useRenderMetrics } from "../../state/session/render-metrics";
import { IconButton } from "../shared/IconButton";
import { AddEffect } from "./menu/AddEffect";
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
    layerCount,
  }: {
    engine: EnginePort;
    page: Composition;
    selection: string[];
    run: (action: () => void) => void;
    attachment: AttachmentTarget | null;
    layerCount: number;
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
        className="layers-footer"
        role="group"
        aria-label={t("layerControls:actions")}
      >
        <div
          className="layer-create-actions"
          role="group"
          aria-label={t("layerControls:createActions")}
        >
          <AddEffect
            engine={engine}
            page={page}
            selection={selection}
            run={runCurrent}
            category="effect"
          />
          <AddEffect
            engine={engine}
            page={page}
            selection={selection}
            run={runCurrent}
            category="adjustment"
          />
        </div>
        <span>{!selection.length && t("layerCount", { count: layerCount })}</span>
        <div
          className="layer-selection-actions"
          role="group"
          aria-label={t("layerControls:selectionActions")}
        >
          <IconButton
            label={t("duplicateLayer")}
            disabled={!state.editable || Boolean(attachment)}
            onClick={() => {
              if (!attachmentSelection(engine).read()) actions.duplicate();
            }}
          >
            <Copy size={13} />
          </IconButton>
          <IconButton
            label={
              attachment
                ? t(attachment.kind === "effect" ? "removeEffect" : "removeMask")
                : t("layerControls:deleteSelection", { count: selection.length })
            }
            disabled={attachment ? !attachmentSelection(engine).editable() : !state.editable}
            onClick={actions.remove}
          >
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>
    );
  },
  (before, after) =>
    before.attachment === after.attachment &&
    before.layerCount === after.layerCount &&
    sameSelectionAvailability(before, after),
);

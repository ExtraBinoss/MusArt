import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  createLayerGeometryIndex,
  type Composition,
  type EnginePort,
  type Layer,
} from "@musart/core";
import { Popover, PopoverTrigger, PopoverContent } from "../../ui/popover";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { MaskProperties } from "../../properties/MaskProperties";
import { useLayerPreview } from "../controls/use-layer-preview";
import { Button } from "../../ui/button";
import { activateLayerPage } from "../tree/activation";
import { attachmentSelection } from "../../../state/selection/attachments";
import { attachmentDeleteKey } from "../../../state/selection/attachment-keydown";
import "../messages";
import { LockedLayerNotice } from "../../properties/locked/LockedLayerNotice";
export function MaskPopover({
  engine,
  page,
  layer,
  run,
  children,
}: {
  engine: EnginePort;
  page: Composition;
  layer: Layer;
  run: (task: () => void) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Popover
      onOpenChange={(open) => {
        if (open)
          attachmentSelection(engine).select(page, {
            kind: "mask",
            pageId: page.id,
            layerId: layer.id,
          });
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        className="floating-panel layer-attachment-popover"
        aria-label={`${t("mask")} · ${layer.name}`}
        onKeyDown={(event) => {
          if (attachmentDeleteKey(event.nativeEvent, engine, run)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <ScrollShadow className="layer-attachment-scroll">
          <div className="layer-attachment-viewport">
            <MaskDetails engine={engine} page={page} layer={layer} run={run} />
          </div>
        </ScrollShadow>
      </PopoverContent>
    </Popover>
  );
}
function MaskDetails({
  engine,
  page,
  layer,
  run,
}: {
  engine: EnginePort;
  page: Composition;
  layer: Layer;
  run: (task: () => void) => void;
}) {
  const { t } = useTranslation();
  const edit = useLayerPreview(engine, page, [layer.id], run);
  return (
    <>
      <LockedLayerNotice engine={engine} page={page} layers={[layer]} run={run} />
      {layer.mask?.layerId && (
        <Button
          variant="ghost"
          className="mask-source-navigation"
          onClick={() => {
            if (activateLayerPage(engine, page) && layer.mask?.layerId)
              engine.select([layer.mask.layerId]);
          }}
        >
          {t("layerControls:selectMaskSource")}
        </Button>
      )}
      <MaskProperties
        engine={engine}
        layer={layer}
        run={run}
        onCommand={edit.command}
        disabled={createLayerGeometryIndex(page).isLocked(layer.id)}
      />
    </>
  );
}

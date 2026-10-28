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
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        className="floating-panel layer-attachment-popover"
        aria-label={`${t("mask")} · ${layer.name}`}
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
  const edit = useLayerPreview(engine, page, [layer.id], run);
  return (
    <MaskProperties
      engine={engine}
      layer={layer}
      run={run}
      onCommand={edit.command}
      disabled={createLayerGeometryIndex(page).isLocked(layer.id)}
    />
  );
}

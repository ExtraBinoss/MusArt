import { useEffect, useMemo, useRef } from "react";
import { Trash2, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Composition, EnginePort, Layer, Project } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import { IconButton } from "../shared/IconButton";
import { LayerMenu } from "./LayerMenu";
import { AddEffect } from "./menu/AddEffect";
import { layerActions } from "./menu/actions";
import { layerSelection } from "./menu/selection";
import { LayerCompositing } from "./controls/LayerCompositing";
import { flattenLayerTree } from "./tree/projection";
import { LayerTree } from "./tree/LayerTree";
import { useRenderMetrics } from "../../state/session/render-metrics";
import { attachmentSelection } from "../../state/selection/attachments";
import { useAttachmentSelection } from "../../state/selection/use-attachment-selection";
import "./messages";
const EMPTY_SELECTION: readonly string[] = Object.freeze([]);
export function flattenLayers(layers: Layer[], parentId: string | null = null): Layer[] {
  return flattenLayerTree(layers, parentId);
}
export function layerDepth(layer: Layer, layers: Layer[]): number {
  const byId = new Map(layers.map((item) => [item.id, item]));
  let depth = 0,
    parent = layer.parentId;
  while (parent) {
    const next = byId.get(parent);
    if (!next) break;
    depth++;
    parent = next.parentId;
  }
  return depth;
}
export function LayersPanel({
  engine,
  page,
  project,
  selection,
  run,
  services,
}: {
  engine: EnginePort;
  page: Composition;
  project: Project;
  selection: string[];
  run: (action: () => void) => void;
  services?: Pick<EditorServices, "previewExport" | "pixelSelection">;
}) {
  const { t } = useTranslation();
  const attachment = useAttachmentSelection(engine);
  useEffect(() => {
    const clearPixels = () => {
      if (attachmentSelection(engine).read() && services?.pixelSelection?.read())
        services.pixelSelection.deselect();
    };
    clearPixels();
    return attachmentSelection(engine).subscribe(clearPixels);
  }, [engine, services?.pixelSelection]);
  const element = useRef<HTMLElement>(null);
  useRenderMetrics(element);
  const layerCount = useMemo(
    () => project.pages.reduce((sum, item) => sum + item.layers.length, 0),
    [project.pages],
  );
  const state = layerSelection(page, selection),
    actions = layerActions(engine, page, run);
  return (
    <section ref={element} className="layers-panel" aria-label={t("layers")}>
      <div className="panel-heading">
        <h2>{t("layers")}</h2>
        <span className="small-count">{layerCount}</span>
        <div className="heading-actions">
          <LayerMenu engine={engine} page={page} selection={selection} run={run} />
        </div>
      </div>
      <LayerCompositing
        key={`${project.id}:${page.id}:${selection.join()}`}
        engine={engine}
        page={page}
        selection={attachment ? EMPTY_SELECTION : selection}
        run={run}
      />
      <p className="sr-only" id="layer-drag-hint">
        {t("layerDragHint")}
      </p>
      <LayerTree
        engine={engine}
        page={page}
        project={project}
        selection={selection}
        run={run}
        services={services}
        attachment={attachment}
      />
      <div className="layers-footer" role="group" aria-label={t("layerControls:actions")}>
        <div
          className="layer-create-actions"
          role="group"
          aria-label={t("layerControls:createActions")}
        >
          <AddEffect
            engine={engine}
            page={page}
            selection={selection}
            run={run}
            category="effect"
          />
          <AddEffect
            engine={engine}
            page={page}
            selection={selection}
            run={run}
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
            onClick={actions.duplicate}
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
    </section>
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Layers, Trash2, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Composition, EnginePort, Layer, Project } from "@musart/core";
import type { EditorServices } from "../../state/contracts";
import { ScrollShadow } from "../shared/scroll/ScrollShadow";
import { IconButton } from "../shared/IconButton";
import { ContextMenu, ContextMenuTrigger } from "../ui/context-menu";
import { LayerMenu } from "./LayerMenu";
import { LayerContext } from "./menu/LayerContext";
import { AddEffect } from "./menu/AddEffect";
import { layerActions } from "./menu/actions";
import { layerSelection } from "./menu/selection";
import { useLayerDrag } from "./drag/use-layer-drag";
import { LayerCompositing } from "./controls/LayerCompositing";
import { LayerRow } from "./rows/LayerRow";
import { LayerAttachments, type EffectDragSession } from "./attachments/LayerAttachments";
import { flattenLayerTree, projectLayerTree } from "./tree/projection";
import { LAYER_ROW_HEIGHT, useVirtualRows } from "./tree/use-virtual-rows";
import { SelectionPreviewIdentity } from "../../services/projects/thumbnails/selection-identity";
import { useRenderMetrics } from "../../state/session/render-metrics";
import "./messages";
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
  services?: Pick<EditorServices, "previewExport">;
}) {
  const { t } = useTranslation();
  const element = useRef<HTMLElement>(null);
  useRenderMetrics(element);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [attachments, setAttachments] = useState<Set<string>>(new Set());
  const drag = useLayerDrag(page, engine, run),
    reduced = !!useReducedMotion();
  const effectDrag = useRef<EffectDragSession | null>(null);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") effectDrag.current = null;
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);
  const toggle = useCallback((id: string, group: boolean) => {
    const update = (previous: Set<string>) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    };
    if (group) setCollapsed(update);
    else setAttachments(update);
  }, []);
  const entries = useMemo(
    () =>
      projectLayerTree(
        drag.layers,
        collapsed,
        attachments,
        drag.target?.position === "inside" ? drag.target.id : undefined,
      ),
    [drag.layers, collapsed, attachments, drag.target],
  );
  const positions = useMemo(() => {
    const result = new Map<string, number>();
    for (let at = 0; at < entries.length; at++)
      if (entries[at]!.kind === "layer") result.set(entries[at]!.layer.id, at);
    return result;
  }, [entries]);
  const selectedIds = useMemo(() => new Set(selection), [selection]);
  const listViewport = useRef<HTMLDivElement>(null);
  const list = useVirtualRows(entries.length, listViewport),
    state = layerSelection(page, selection),
    actions = layerActions(engine, page, run);
  const { onScroll, scheduleReveal } = list;
  const thumbnailIdentities = useMemo(() => new SelectionPreviewIdentity(), []);
  const previewKeys = useMemo(() => {
    const result = new Map<string, string>();
    for (const entry of entries.slice(list.first, list.last))
      if (entry.kind === "layer")
        result.set(
          entry.layer.id,
          `${project.id}:${page.id}:${thumbnailIdentities.read(page, project.assets, [entry.layer.id])}`,
        );
    return result;
  }, [entries, list.first, list.last, project.id, project.assets, page, thumbnailIdentities]);
  useLayoutEffect(() => {
    const node = listViewport.current,
      at = selection[0] ? positions.get(selection[0]) : undefined;
    if (!node || at === undefined || drag.dragging) return;
    const id = selection[0]!;
    return scheduleReveal(node, at, () => {
      const snapshot = engine.getSnapshot();
      return (
        snapshot.pageId === page.id &&
        snapshot.project.pages.find((item) => item.id === page.id) === page &&
        snapshot.selection[0] === id
      );
    });
  }, [selection, positions, drag.dragging, scheduleReveal, engine, page]);
  return (
    <section ref={element} className="layers-panel" aria-label={t("layers")}>
      <div className="panel-heading">
        <h2>{t("layers")}</h2>
        <span className="small-count">{page.layers.length}</span>
        <div className="heading-actions">
          <LayerMenu engine={engine} page={page} selection={selection} run={run} />
        </div>
      </div>
      <LayerCompositing
        key={`${project.id}:${page.id}:${selection.join()}`}
        engine={engine}
        page={page}
        selection={selection}
        run={run}
      />
      <p className="sr-only" id="layer-drag-hint">
        {t("layerDragHint")}
      </p>
      <ContextMenu>
        <ScrollShadow className="layer-tree-scroll">
          <ContextMenuTrigger asChild>
            <div
              ref={listViewport}
              role="tree"
              aria-label={t("layers")}
              aria-describedby="layer-drag-hint"
              className="layer-tree scrollable-panel"
              onScroll={onScroll}
              onDragOver={(event) => drag.overTree(event)}
              onDrop={(event) => drag.drop(event)}
            >
              {!entries.length ? (
                <div className="empty-layers">
                  <Layers size={24} strokeWidth={1.1} />
                  <p>{t("emptyLayers")}</p>
                  <span>{t("emptyLayerHint")}</span>
                </div>
              ) : (
                <div
                  className="layer-tree-window"
                  style={{ position: "relative", height: list.height }}
                  data-total-rows={entries.length}
                >
                  {entries
                    .slice(list.first, list.last)
                    .map((entry, offset) =>
                      entry.kind === "layer" ? (
                        <LayerRow
                          key={`${project.id}:${entry.key}`}
                          engine={engine}
                          page={page}
                          layer={entry.layer}
                          assets={project.assets}
                          selected={selectedIds.has(entry.layer.id)}
                          depth={entry.depth}
                          expanded={entry.expanded}
                          moving={!!drag.dragging}
                          dragging={drag.dragging === entry.layer.id}
                          drop={
                            drag.target?.id === entry.layer.id ? drag.target.position : undefined
                          }
                          reduced={reduced}
                          services={services}
                          previewKey={previewKeys.get(entry.layer.id)!}
                          top={(list.first + offset) * LAYER_ROW_HEIGHT}
                          run={run}
                          onToggle={toggle}
                          onDragEnd={drag.cancel}
                          drag={drag.handlers}
                        />
                      ) : (
                        <LayerAttachments
                          key={`${project.id}:${entry.key}`}
                          engine={engine}
                          page={page}
                          layer={entry.layer}
                          effectId={entry.kind === "effect" ? entry.effectId : undefined}
                          mask={entry.kind === "mask"}
                          depth={entry.depth}
                          top={(list.first + offset) * LAYER_ROW_HEIGHT}
                          run={run}
                          drag={effectDrag}
                        />
                      ),
                    )}
                </div>
              )}
            </div>
          </ContextMenuTrigger>
        </ScrollShadow>
        <LayerContext engine={engine} page={page} selection={selection} run={run} />
      </ContextMenu>
      <div className="layers-footer">
        <div className="layer-create-actions">
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
        <span>{!selection.length && t("layerCount", { count: page.layers.length })}</span>
        <div>
          <IconButton
            label={t("duplicateLayer")}
            disabled={!state.editable}
            onClick={actions.duplicate}
          >
            <Copy size={13} />
          </IconButton>
          <IconButton
            label={t("layerControls:deleteSelection", { count: selection.length })}
            disabled={!state.editable}
            onClick={actions.remove}
          >
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>
    </section>
  );
}

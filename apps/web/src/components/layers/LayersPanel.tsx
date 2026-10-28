import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Trash2, Copy } from "lucide-react";
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
import { layerDragWindow } from "./drag/window";
import { LayerCompositing } from "./controls/LayerCompositing";
import { LayerRow } from "./rows/LayerRow";
import { LayerAttachments, type EffectDragSession } from "./attachments/LayerAttachments";
import { flattenLayerTree } from "./tree/projection";
import { projectLayerWorkspace } from "./tree/project";
import { ArtboardRow } from "./rows/ArtboardRow";
import { LAYER_ROW_HEIGHT, useVirtualRows } from "./tree/use-virtual-rows";
import { SelectionPreviewIdentity } from "../../services/projects/thumbnails/selection-identity";
import { useRenderMetrics } from "../../state/session/render-metrics";
import { attachmentSelection } from "../../state/selection/attachments";
import { useAttachmentSelection } from "../../state/selection/use-attachment-selection";
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [attachments, setAttachments] = useState<Set<string>>(new Set()),
    [collapsedPages, setCollapsedPages] = useState<Set<string>>(new Set());
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
  const togglePage = useCallback((id: string) => {
    setCollapsedPages((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const layerCount = useMemo(
    () => project.pages.reduce((sum, item) => sum + item.layers.length, 0),
    [project.pages],
  );
  const canonicalEntries = useMemo(
    () => projectLayerWorkspace(project, collapsedPages, collapsed, attachments),
    [project, collapsedPages, collapsed, attachments],
  );
  const entries = useMemo(
    () =>
      drag.dragging
        ? projectLayerWorkspace(project, collapsedPages, collapsed, attachments, {
            pageId: drag.pageId,
            layers: drag.layers,
            inside: drag.target?.position === "inside" ? drag.target.id : undefined,
          })
        : canonicalEntries,
    [
      drag.dragging,
      drag.layers,
      drag.pageId,
      project,
      collapsedPages,
      collapsed,
      attachments,
      drag.target,
      canonicalEntries,
    ],
  );
  const positions = useMemo(() => {
    const result = new Map<string, number>();
    for (let at = 0; at < entries.length; at++) {
      const entry = entries[at]!;
      if (entry.kind === "layer") result.set(entry.layer.id, at);
    }
    return result;
  }, [entries]);
  const selectedIds = useMemo(() => new Set(selection), [selection]);
  const listViewport = useRef<HTMLDivElement>(null);
  const list = useVirtualRows(entries.length, listViewport),
    state = layerSelection(page, selection),
    actions = layerActions(engine, page, run);
  const { onScroll, scheduleReveal } = list;
  const visibleEntries = useMemo(
    () => layerDragWindow(entries, canonicalEntries, list.first, list.last, drag.dragging),
    [entries, canonicalEntries, list.first, list.last, drag.dragging],
  );
  const thumbnailIdentities = useMemo(() => new SelectionPreviewIdentity(), []);
  const previewKeys = useMemo(() => {
    const result = new Map<string, string>();
    for (const { entry } of visibleEntries)
      if (entry.kind === "layer")
        result.set(
          entry.layer.id,
          `${project.id}:${entry.page.id}:${thumbnailIdentities.read(entry.page, project.assets, [entry.layer.id])}`,
        );
    return result;
  }, [visibleEntries, project.id, project.assets, thumbnailIdentities]);
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
        <span className="small-count">{layerCount}</span>
        <div className="heading-actions">
          <LayerMenu engine={engine} page={page} selection={selection} run={run} />
        </div>
      </div>
      <LayerCompositing
        key={`${project.id}:${page.id}:${selection.join()}`}
        engine={engine}
        page={page}
        selection={attachment ? [] : selection}
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
              onDragEnter={(event) => drag.overTree(event)}
              onDrop={(event) => drag.drop(event)}
            >
              <div
                className="layer-tree-window"
                style={{ position: "relative", height: list.height }}
                data-total-rows={entries.length}
              >
                {visibleEntries.map(({ entry, at }) =>
                  entry.kind === "artboard" ? (
                    <ArtboardRow
                      key={`${project.id}:${entry.key}`}
                      engine={engine}
                      page={entry.page}
                      active={entry.page.id === page.id}
                      expanded={entry.expanded}
                      top={at * LAYER_ROW_HEIGHT}
                      onToggle={togglePage}
                      onDragReject={drag.clearTarget}
                    />
                  ) : entry.kind === "empty" ? (
                    <div
                      key={`${project.id}:${entry.key}`}
                      className="empty-artboard-layers"
                      onDragOver={(event) => {
                        event.stopPropagation();
                        drag.clearTarget(event);
                      }}
                      onDrop={(event) => {
                        event.stopPropagation();
                        drag.clearTarget(event);
                      }}
                      style={{ position: "absolute", top: at * LAYER_ROW_HEIGHT }}
                    >
                      {t("emptyLayers")}
                    </div>
                  ) : entry.kind === "layer" ? (
                    <LayerRow
                      key={`${project.id}:${entry.key}`}
                      engine={engine}
                      page={entry.page}
                      layer={entry.layer}
                      assets={project.assets}
                      selected={entry.page.id === page.id && selectedIds.has(entry.layer.id)}
                      attachmentTarget={
                        attachment?.pageId === entry.page.id &&
                        attachment.layerId === entry.layer.id
                          ? attachment
                          : null
                      }
                      depth={entry.depth}
                      expanded={entry.expanded}
                      moving={!!drag.dragging}
                      dragging={drag.dragging === entry.layer.id}
                      drop={drag.target?.id === entry.layer.id ? drag.target.position : undefined}
                      reduced={reduced}
                      services={services}
                      previewKey={previewKeys.get(entry.layer.id)!}
                      top={at * LAYER_ROW_HEIGHT}
                      run={run}
                      onToggle={toggle}
                      onDragEnd={drag.cancel}
                      drag={drag.handlers}
                    />
                  ) : (
                    <LayerAttachments
                      key={`${project.id}:${entry.key}`}
                      engine={engine}
                      page={entry.page}
                      layer={entry.layer}
                      effectId={entry.kind === "effect" ? entry.effectId : undefined}
                      mask={entry.kind === "mask"}
                      selected={
                        attachment?.pageId === entry.page.id &&
                        attachment.layerId === entry.layer.id &&
                        (entry.kind === "mask"
                          ? attachment.kind === "mask"
                          : attachment.kind === "effect" && attachment.effectId === entry.effectId)
                      }
                      depth={entry.depth}
                      top={at * LAYER_ROW_HEIGHT}
                      run={run}
                      drag={effectDrag}
                    />
                  ),
                )}
              </div>
            </div>
          </ContextMenuTrigger>
        </ScrollShadow>
        <LayerContext engine={engine} page={page} selection={selection} run={run} />
      </ContextMenu>
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

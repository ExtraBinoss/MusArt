import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { Composition, EnginePort, Project } from "@musart/core";
import type { EditorServices } from "../../../state/contracts";
import type { AttachmentTarget } from "../../../state/selection/attachments";
import { useRenderMetrics } from "../../../state/session/render-metrics";
import { SelectionPreviewIdentity } from "../../../services/projects/thumbnails/selection-identity";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { ContextMenu, ContextMenuTrigger } from "../../ui/context-menu";
import { LayerContext } from "../menu/LayerContext";
import { useLayerDrag } from "../drag/use-layer-drag";
import { layerDragWindow } from "../drag/window";
import { LayerRow } from "../rows/LayerRow";
import { ArtboardRow } from "../rows/ArtboardRow";
import { LayerAttachments, type EffectDragSession } from "../attachments/LayerAttachments";
import { projectLayerWorkspace } from "./project";
import { LAYER_ROW_HEIGHT, useVirtualRows } from "./use-virtual-rows";
import { useExpansion } from "./use-expansion";
import { useRowSlots } from "./use-row-slots";

/** Native scroll updates only the bounded tree window, leaving panel controls untouched. */
export const LayerTree = memo(function LayerTree({
  engine,
  page,
  project,
  selection,
  run,
  services,
  attachment,
}: {
  engine: EnginePort;
  page: Composition;
  project: Project;
  selection: string[];
  run: (action: () => void) => void;
  services?: Pick<EditorServices, "previewExport" | "pixelSelection">;
  attachment: AttachmentTarget | null;
}) {
  const { t } = useTranslation();
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
  const canonicalEntries = useMemo(
    () => projectLayerWorkspace(project, collapsedPages, collapsed, attachments),
    [project, collapsedPages, collapsed, attachments],
  );
  const entries = canonicalEntries;
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
  const scrollFocus = useRef<{ node: HTMLElement; owner: string } | null>(null);
  useRenderMetrics(listViewport);
  const list = useVirtualRows(entries.length, listViewport);
  const { onScroll, scheduleReveal } = list;
  const currentEntries = useMemo(
    () => layerDragWindow(entries, canonicalEntries, list.first, list.last, drag.dragging),
    [entries, canonicalEntries, list.first, list.last, drag.dragging],
  );
  const {
    items: visibleEntries,
    begin: beginExpansion,
    cancel: cancelExpansion,
  } = useExpansion(
    currentEntries,
    entries,
    list.height,
    project,
    listViewport,
    reduced || !!drag.dragging,
  );
  const toggle = useCallback(
    (id: string, group: boolean) => {
      beginExpansion(`layer:${id}`);
      const update = (previous: Set<string>) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      };
      if (group) setCollapsed(update);
      else setAttachments(update);
    },
    [beginExpansion],
  );
  const togglePage = useCallback(
    (id: string) => {
      beginExpansion(`artboard:${id}`);
      setCollapsedPages((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [beginExpansion],
  );
  const thumbnailIdentities = useMemo(() => new SelectionPreviewIdentity(), []);
  const slottedEntries = useRowSlots(visibleEntries, !!drag.dragging);
  useLayoutEffect(() => {
    const saved = scrollFocus.current;
    scrollFocus.current = null;
    if (
      saved?.node.isConnected &&
      document.activeElement === document.body &&
      saved.node.closest<HTMLElement>("[data-layer-tree-key]")?.dataset.layerTreeKey === saved.owner
    )
      saved.node.focus({ preventScroll: true });
  });
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
    <ContextMenu modal={false}>
      <ScrollShadow className="layer-tree-scroll">
        <ContextMenuTrigger asChild>
          <div
            ref={listViewport}
            role="tree"
            aria-label={t("layers")}
            aria-describedby="layer-drag-hint"
            className="layer-tree scrollable-panel"
            data-layer-drag-viewport
            onScroll={(event) => {
              cancelExpansion();
              const focused = document.activeElement;
              const owner =
                focused?.closest<HTMLElement>("[data-layer-tree-key]")?.dataset.layerTreeKey;
              if (onScroll(event))
                scrollFocus.current =
                  focused instanceof HTMLElement && owner && event.currentTarget.contains(focused)
                    ? { node: focused, owner }
                    : null;
            }}
            onDragStartCapture={cancelExpansion}
            onDragOver={(event) => drag.overTree(event)}
            onDragEnter={(event) => drag.overTree(event)}
            onDrop={(event) => drag.drop(event)}
          >
            <div
              className="layer-tree-window"
              style={{ position: "relative", height: list.height }}
              data-total-rows={entries.length}
            >
              {slottedEntries.map(({ entry, at, slot }) =>
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
                    data-layer-tree-key={`empty:${entry.page.id}`}
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
                    key={`${project.id}:${slot}`}
                    engine={engine}
                    page={entry.page}
                    layer={entry.layer}
                    assets={project.assets}
                    selected={entry.page.id === page.id && selectedIds.has(entry.layer.id)}
                    attachmentTarget={
                      attachment?.pageId === entry.page.id && attachment.layerId === entry.layer.id
                        ? attachment
                        : null
                    }
                    depth={entry.depth}
                    expanded={entry.expanded}
                    moving={!!drag.dragging}
                    dragging={drag.dragging === entry.layer.id}
                    drop={drag.target?.id === entry.layer.id ? drag.target.position : undefined}
                    rejected={
                      drag.rejected?.id === entry.layer.id ? drag.rejected.reason : undefined
                    }
                    reduced={reduced}
                    services={services}
                    previewKey={previewKeys.get(entry.layer.id)!}
                    top={at * LAYER_ROW_HEIGHT}
                    run={run}
                    onToggle={toggle}
                    onDragEnd={drag.cancelOwned}
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
  );
});

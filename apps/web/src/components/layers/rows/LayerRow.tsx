import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { useRowPosition } from "./use-row-position";
import { LayerRowContents } from "./LayerRowContents";
import { useTranslation } from "react-i18next";
import {
  createLayerGeometryIndex,
  type Composition,
  type EnginePort,
  type Layer,
  type Project,
} from "@musart/core";
import type { EditorServices } from "../../../state/contracts";
import type { useLayerDrag } from "../drag/use-layer-drag";
import type { LayerDropPosition } from "../drop-target";
import type { LayerDropRejection } from "../drag/validation";
import { attachmentSelection, type AttachmentTarget } from "../../../state/selection/attachments";
import { activateLayerPage, resolveLayerPage, sameLayerContainer } from "../tree/activation";
import "./layer-row.css";
import "../messages";
import { useLayerHover } from "./use-layer-hover";
import { getTransitionRequests } from "../../motion/transitions/requests";
export const LayerRow = memo(function LayerRow({
  engine,
  page: incomingPage,
  layer,
  assets,
  selected,
  attachmentTarget = null,
  depth,
  expanded,
  moving,
  dragging,
  drop,
  rejected,
  reduced,
  services,
  previewKey,
  top,
  run,
  onToggle,
  drag,
  onDragEnd,
}: {
  engine: EnginePort;
  page: Composition;
  layer: Layer;
  assets: Project["assets"];
  selected: boolean;
  attachmentTarget?: AttachmentTarget | null;
  depth: number;
  expanded: boolean;
  moving: boolean;
  dragging: boolean;
  drop?: LayerDropPosition;
  rejected?: LayerDropRejection;
  reduced: boolean;
  services?: Pick<EditorServices, "previewExport">;
  previewKey: string;
  top: number;
  run: (task: () => void) => void;
  onDragEnd: () => void;
  onToggle: (id: string, group: boolean) => void;
  drag: ReturnType<typeof useLayerDrag>["handlers"];
}) {
  const { t } = useTranslation();
  const [retainedPage, setRetainedPage] = useState(incomingPage);
  // Stable layer membership owns callbacks and drafts; page metadata is resolved at interaction time.
  const page = sameLayerContainer(retainedPage, incomingPage) ? retainedPage : incomingPage;
  if (page !== retainedPage) setRetainedPage(page);
  const hover = useLayerHover(engine, page.id, layer.id);
  const node = useRef<HTMLDivElement>(null);
  useRowPosition(node, JSON.stringify([page.id, layer.id]), top, moving, reduced);
  const [editing, setEditing] = useState<{ page: Composition; id: string } | null>(null);
  const renaming = editing?.page === page && editing.id === layer.id;
  if (editing && !renaming) setEditing(null);
  useLayoutEffect(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && node.current?.contains(focused)) focused.blur();
  }, [layer.id, page.id]);
  const geometry = createLayerGeometryIndex(page);
  const parentLocked = !!layer.parentId && geometry.isLocked(layer.parentId);
  const locked = layer.locked || parentLocked;
  const lockedParent = parentLocked
    ? geometry.ancestors(layer.id).find((ancestor) => ancestor.locked)
    : undefined;
  const lockDescription = lockedParent
    ? t("layerControls:lockedByParent", { name: lockedParent.name })
    : t("layerControls:lockedState");
  const expandable = layer.kind === "group" || !!layer.effects.length || !!layer.mask;
  const canonical = useCallback(
    (origin: Composition) => {
      const snapshot = engine.getSnapshot();
      return (
        snapshot.pageId === origin.id &&
        snapshot.project.pages.find((item) => item.id === origin.id) === origin
      );
    },
    [engine],
  );
  function select(additive: boolean) {
    const samePage = engine.getSnapshot().pageId === page.id;
    if (!activateLayerPage(engine, page)) return;
    attachmentSelection(engine).clear();
    const selection = engine.getSnapshot().selection;
    engine.select(
      additive && samePage
        ? selection.includes(layer.id)
          ? selection.filter((id) => id !== layer.id)
          : [...selection, layer.id]
        : [layer.id],
    );
  }
  const rename = useCallback(
    (name: string) => {
      const valid = renaming;
      setEditing(null);
      const origin = resolveLayerPage(engine, page);
      if (valid && origin && name.trim() && name.trim() !== layer.name)
        run(() => {
          if (canonical(origin))
            engine.execute({ type: "updateLayers", ids: [layer.id], patch: { name: name.trim() } });
        });
    },
    [renaming, page, layer.id, layer.name, run, canonical, engine],
  );
  const cancelRename = useCallback(() => setEditing(null), []);
  const toggle = useCallback(
    () => onToggle(layer.id, layer.kind === "group"),
    [onToggle, layer.id, layer.kind],
  );
  const expand = useCallback(() => {
    if (!expanded) toggle();
  }, [expanded, toggle]);
  const toggleLock = useCallback(() => {
    if (!activateLayerPage(engine, page)) return;
    const origin = resolveLayerPage(engine, page);
    if (!origin) return;
    run(() => {
      if (canonical(origin))
        engine.execute({ type: "updateLayers", ids: [layer.id], patch: { locked: !layer.locked } });
    });
  }, [engine, page, run, canonical, layer.id, layer.locked]);
  const toggleVisibility = useCallback(() => {
    if (!activateLayerPage(engine, page)) return;
    const origin = resolveLayerPage(engine, page);
    if (!origin) return;
    run(() => {
      if (canonical(origin))
        engine.execute({
          type: "updateLayers",
          ids: [layer.id],
          patch: { visible: !layer.visible },
        });
    });
  }, [engine, page, run, canonical, layer.id, layer.visible]);
  return (
    <div
      ref={node}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected && !attachmentTarget}
      aria-expanded={expandable ? expanded : undefined}
      title={locked ? lockDescription : undefined}
      tabIndex={0}
      draggable={!locked}
      data-layer-id={layer.id}
      data-layer-kind={layer.kind}
      data-layer-drop-id={layer.id}
      data-layer-drop-page-id={page.id}
      data-layer-drop-kind="layer"
      data-layer-tree-key={`layer:${layer.id}`}
      data-dragging={dragging || undefined}
      data-locked={locked || undefined}
      data-lock-inherited={parentLocked || undefined}
      className={`layer-row ${selected && !attachmentTarget ? "selected" : ""} ${locked ? "is-locked" : ""} ${!layer.visible ? "is-hidden" : ""} ${drop ? `drop-${drop}` : ""}`}
      style={{ position: "absolute", left: 0, right: 0, top, paddingLeft: 12 + depth * 16 }}
      onPointerEnter={hover.onPointerEnter}
      onPointerLeave={hover.onPointerLeave}
      onFocus={hover.onFocus}
      onBlur={hover.onBlur}
      onClick={(event) => {
        if (event.currentTarget.contains(event.target as Node))
          select(event.shiftKey || event.metaKey || event.ctrlKey);
      }}
      onContextMenu={(event) => {
        if (!event.currentTarget.contains(event.target as Node)) {
          event.stopPropagation();
          return;
        }
        if ((event.target as Element).closest("[data-attachment-target]")) return;
        if (!resolveLayerPage(engine, page)) return;
        getTransitionRequests(engine).remember({ x: event.clientX, y: event.clientY });
        attachmentSelection(engine).clear();
        const snapshot = engine.getSnapshot();
        if (snapshot.pageId !== page.id || !snapshot.selection.includes(layer.id)) select(false);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select(event.shiftKey || event.metaKey || event.ctrlKey);
        }
        if (event.key === "F2" && !locked && activateLayerPage(engine, page))
          setEditing({ page, id: layer.id });
      }}
      onDoubleClick={() => {
        if (!locked && activateLayerPage(engine, page)) setEditing({ page, id: layer.id });
      }}
      onDragStartCapture={(event) => {
        hover.clear();
        if ((event.target as Element).closest("[data-attachment-target]")) {
          event.preventDefault();
          return;
        }
        const current = resolveLayerPage(engine, page);
        if (current) drag.start(event, layer, current);
        else event.preventDefault();
      }}
      onDragOver={(event) => {
        const current = resolveLayerPage(engine, page);
        if (current) drag.over(event, layer, current);
      }}
      onDragEndCapture={onDragEnd}
      onDrop={(event) => {
        const current = resolveLayerPage(engine, page);
        if (current) drag.drop(event, layer, current);
      }}
    >
      <LayerRowContents
        engine={engine}
        page={page}
        layer={layer}
        assets={assets}
        services={services}
        previewKey={previewKey}
        attachmentTarget={attachmentTarget}
        expanded={expanded}
        renaming={renaming}
        parentLocked={parentLocked}
        locked={locked}
        lockDescription={lockDescription}
        drop={drop}
        rejected={rejected}
        anchor={node}
        run={run}
        onToggle={toggle}
        onExpand={expand}
        onRename={rename}
        onCancelRename={cancelRename}
        onLock={toggleLock}
        onVisibility={toggleVisibility}
      />
    </div>
  );
});

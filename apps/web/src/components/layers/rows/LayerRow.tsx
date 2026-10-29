import { memo, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ChevronRight, Eye, EyeOff, LockKeyhole, LockKeyholeOpen, ScanLine } from "lucide-react";
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
import { Input } from "../../ui/input";
import { IconButton } from "../../shared/IconButton";
import { LayerThumbnail } from "./LayerThumbnail";
import { AttachmentCards } from "../attachments/AttachmentCards";
import { attachmentSelection, type AttachmentTarget } from "../../../state/selection/attachments";
import { DropCue } from "../drag/DropCue";
import { activateLayerPage } from "../tree/activation";
import "./layer-row.css";
import "../messages";
export const LayerRow = memo(function LayerRow({
  engine,
  page,
  layer,
  assets,
  selected,
  attachmentTarget = null,
  depth,
  expanded,
  moving,
  dragging,
  drop,
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
  const node = useRef<HTMLDivElement>(null);
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
  function canonical() {
    const snapshot = engine.getSnapshot();
    return (
      snapshot.pageId === page.id &&
      snapshot.project.pages.find((item) => item.id === page.id) === page
    );
  }
  function select(additive: boolean) {
    attachmentSelection(engine).clear();
    const samePage = engine.getSnapshot().pageId === page.id;
    if (!activateLayerPage(engine, page)) return;
    const selection = engine.getSnapshot().selection;
    engine.select(
      additive && samePage
        ? selection.includes(layer.id)
          ? selection.filter((id) => id !== layer.id)
          : [...selection, layer.id]
        : [layer.id],
    );
  }
  function rename(name: string) {
    const valid = renaming;
    setEditing(null);
    if (valid && name.trim() && name.trim() !== layer.name)
      run(() => {
        if (canonical())
          engine.execute({ type: "updateLayers", ids: [layer.id], patch: { name: name.trim() } });
      });
  }
  return (
    <motion.div
      ref={node}
      layout={!reduced && moving ? "position" : false}
      transition={{ type: "spring", stiffness: 430, damping: 34, mass: 0.65 }}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected && !attachmentTarget}
      aria-expanded={expandable ? expanded : undefined}
      title={locked ? lockDescription : undefined}
      tabIndex={0}
      draggable={!locked}
      data-layer-id={layer.id}
      data-layer-tree-key={`layer:${layer.id}`}
      data-dragging={dragging || undefined}
      data-locked={locked || undefined}
      data-lock-inherited={parentLocked || undefined}
      className={`layer-row ${selected && !attachmentTarget ? "selected" : ""} ${locked ? "is-locked" : ""} ${!layer.visible ? "is-hidden" : ""} ${drop ? `drop-${drop}` : ""}`}
      style={{ position: "absolute", left: 0, right: 0, top, paddingLeft: 12 + depth * 16 }}
      onClick={(event) => select(event.shiftKey || event.metaKey || event.ctrlKey)}
      onContextMenu={(event) => {
        if ((event.target as Element).closest("[data-attachment-target]")) return;
        attachmentSelection(engine).clear();
        if (!engine.getSnapshot().selection.includes(layer.id)) select(false);
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
        if ((event.target as Element).closest("[data-attachment-target]")) {
          event.preventDefault();
          return;
        }
        drag.start(event, layer, page);
      }}
      onDragOver={(event) => drag.over(event, layer, page)}
      onDragEndCapture={onDragEnd}
      onDrop={(event) => drag.drop(event, layer, page)}
    >
      {expandable && (
        <button
          className="group-chevron"
          aria-label={layer.name}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(layer.id, layer.kind === "group");
          }}
        >
          <ChevronRight size={12} className="layer-chevron-icon" data-expanded={expanded} />
        </button>
      )}
      <LayerThumbnail
        layer={layer}
        asset={layer.assetId ? assets[layer.assetId] : undefined}
        services={services}
        previewKey={previewKey}
        pageId={page.id}
      />
      {renaming ? (
        <Input
          autoFocus
          className="layer-name-input"
          aria-label={t("renameLayer")}
          defaultValue={layer.name}
          onClick={(event) => event.stopPropagation()}
          onBlur={(event) => rename(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") rename(event.currentTarget.value);
            if (event.key === "Escape") setEditing(null);
          }}
        />
      ) : (
        <span className="layer-name">{layer.name}</span>
      )}
      {layer.maskSource && (
        <span className="mask-indicator" aria-label={t("maskSource")}>
          <ScanLine size={12} />
        </span>
      )}
      {(layer.effects.length > 0 || layer.mask) && (
        <AttachmentCards
          engine={engine}
          page={page}
          layer={layer}
          assets={assets}
          services={services}
          previewKey={previewKey}
          target={attachmentTarget}
          onExpand={() => {
            if (!expanded) onToggle(layer.id, layer.kind === "group");
          }}
          run={run}
        />
      )}
      {drop && <DropCue anchor={node} position={drop} />}
      <div
        className="layer-actions"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <IconButton
          disabled={parentLocked}
          className={`layer-lock-button ${locked ? "is-locked" : ""}`}
          label={`${parentLocked ? lockDescription : t(layer.locked ? "unlock" : "lock")} · ${layer.name}`}
          aria-description={locked ? lockDescription : undefined}
          onClick={() => {
            if (!activateLayerPage(engine, page)) return;
            run(() => {
              if (canonical())
                engine.execute({
                  type: "updateLayers",
                  ids: [layer.id],
                  patch: { locked: !layer.locked },
                });
            });
          }}
        >
          {locked ? <LockKeyhole size={14} /> : <LockKeyholeOpen size={12} />}
          {locked && (
            <span className="layer-lock-label" aria-hidden>
              {t("layerControls:lockedState")}
            </span>
          )}
        </IconButton>
        <IconButton
          disabled={parentLocked}
          label={`${t(layer.visible ? "visible" : "hidden")} · ${layer.name}`}
          onClick={() => {
            if (!activateLayerPage(engine, page)) return;
            run(() => {
              if (canonical())
                engine.execute({
                  type: "updateLayers",
                  ids: [layer.id],
                  patch: { visible: !layer.visible },
                });
            });
          }}
        >
          {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </IconButton>
      </div>
    </motion.div>
  );
});

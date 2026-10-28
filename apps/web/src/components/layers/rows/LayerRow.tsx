import { memo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  LockKeyhole,
  LockKeyholeOpen,
  ScanLine,
} from "lucide-react";
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
  const [editing, setEditing] = useState<Composition | null>(null);
  const parentLocked = !!layer.parentId && createLayerGeometryIndex(page).isLocked(layer.parentId);
  const locked = layer.locked || parentLocked;
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
    const valid = editing === page;
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
      tabIndex={0}
      draggable={!locked}
      data-layer-id={layer.id}
      data-dragging={dragging || undefined}
      className={`layer-row ${selected && !attachmentTarget ? "selected" : ""} ${!layer.visible ? "is-hidden" : ""} ${drop ? `drop-${drop}` : ""}`}
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
        if (event.key === "F2" && !locked && activateLayerPage(engine, page)) setEditing(page);
      }}
      onDoubleClick={() => {
        if (!locked && activateLayerPage(engine, page)) setEditing(page);
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
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      )}
      <LayerThumbnail
        layer={layer}
        asset={layer.assetId ? assets[layer.assetId] : undefined}
        services={services}
        previewKey={previewKey}
        pageId={page.id}
      />
      {editing === page ? (
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
          label={`${t(layer.locked ? "unlock" : "lock")} · ${layer.name}`}
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
          {layer.locked ? <LockKeyhole size={12} /> : <LockKeyholeOpen size={12} />}
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

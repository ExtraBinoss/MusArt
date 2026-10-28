import { memo, useState } from "react";
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
import { Button } from "../../ui/button";
import { IconButton } from "../../shared/IconButton";
import { LayerThumbnail } from "./LayerThumbnail";
import { EffectPopover } from "../attachments/EffectPopover";
import { MaskPopover } from "../attachments/MaskPopover";
export const LayerRow = memo(function LayerRow({
  engine,
  page,
  layer,
  assets,
  selected,
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
  const [editing, setEditing] = useState(false);
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
    if (!canonical()) return;
    const selection = engine.getSnapshot().selection;
    engine.select(
      additive
        ? selection.includes(layer.id)
          ? selection.filter((id) => id !== layer.id)
          : [...selection, layer.id]
        : [layer.id],
    );
  }
  function rename(name: string) {
    setEditing(false);
    if (name.trim() && name.trim() !== layer.name)
      run(() => {
        if (canonical())
          engine.execute({ type: "updateLayers", ids: [layer.id], patch: { name: name.trim() } });
      });
  }
  return (
    <motion.div
      layout={!reduced && moving ? "position" : false}
      transition={{ type: "spring", stiffness: 430, damping: 34, mass: 0.65 }}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={expandable ? expanded : undefined}
      tabIndex={0}
      draggable={!locked}
      data-layer-id={layer.id}
      data-dragging={dragging || undefined}
      className={`layer-row ${selected ? "selected" : ""} ${!layer.visible ? "is-hidden" : ""} ${drop ? `drop-${drop}` : ""}`}
      style={{ position: "absolute", left: 0, right: 0, top, paddingLeft: 12 + depth * 16 }}
      onClick={(event) => select(event.shiftKey || event.metaKey || event.ctrlKey)}
      onContextMenu={() => {
        if (!engine.getSnapshot().selection.includes(layer.id)) select(false);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select(event.shiftKey || event.metaKey || event.ctrlKey);
        }
        if (event.key === "F2" && !locked) setEditing(true);
      }}
      onDoubleClick={() => {
        if (!locked) setEditing(true);
      }}
      onDragStartCapture={(event) => drag.start(event, layer)}
      onDragOver={(event) => drag.over(event, layer)}
      onDragEndCapture={onDragEnd}
      onDrop={(event) => drag.drop(event, layer)}
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
      />
      {editing ? (
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
            if (event.key === "Escape") setEditing(false);
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
      <div
        className="layer-badges"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {layer.effects.length > 0 && (
          <EffectPopover engine={engine} page={page} layer={layer} run={run}>
            <Button
              variant="ghost"
              size="icon-xs"
              className="layer-attachment-avatar effect-avatar"
              aria-label={`${t("effects")} · ${layer.name}`}
            >
              fx
            </Button>
          </EffectPopover>
        )}
        {layer.mask && (
          <MaskPopover engine={engine} page={page} layer={layer} run={run}>
            <Button
              variant="ghost"
              size="icon-xs"
              className="layer-attachment-avatar mask-avatar"
              aria-label={`${t("mask")} · ${layer.name}`}
            >
              <ScanLine size={12} />
            </Button>
          </MaskPopover>
        )}
      </div>
      {drop && (
        <span className="drop-label">
          {t(
            { before: "dropBefore", after: "dropAfter", inside: "dropInside", mask: "dropMask" }[
              drop
            ],
          )}
        </span>
      )}
      <div
        className="layer-actions"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <IconButton
          disabled={parentLocked}
          label={`${t(layer.locked ? "unlock" : "lock")} · ${layer.name}`}
          onClick={() =>
            run(() => {
              if (canonical())
                engine.execute({
                  type: "updateLayers",
                  ids: [layer.id],
                  patch: { locked: !layer.locked },
                });
            })
          }
        >
          {layer.locked ? <LockKeyhole size={12} /> : <LockKeyholeOpen size={12} />}
        </IconButton>
        <IconButton
          disabled={parentLocked}
          label={`${t(layer.visible ? "visible" : "hidden")} · ${layer.name}`}
          onClick={() =>
            run(() => {
              if (canonical())
                engine.execute({
                  type: "updateLayers",
                  ids: [layer.id],
                  patch: { visible: !layer.visible },
                });
            })
          }
        >
          {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </IconButton>
      </div>
    </motion.div>
  );
});

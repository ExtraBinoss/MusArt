import { memo, type RefObject } from "react";
import { ChevronRight, Eye, EyeOff, LockKeyhole, LockKeyholeOpen, ScanLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Composition, EnginePort, Layer, Project } from "@musart/core";
import type { EditorServices } from "../../../state/contracts";
import type { AttachmentTarget } from "../../../state/selection/attachments";
import type { LayerDropPosition } from "../drop-target";
import type { LayerDropRejection } from "../drag/validation";
import { Input } from "../../ui/input";
import { IconButton } from "../../shared/IconButton";
import { LayerThumbnail } from "./LayerThumbnail";
import { AttachmentCards } from "../attachments/AttachmentCards";
import { DropCue } from "../drag/DropCue";
import "../messages";

/** Selection and page metadata leave static controls intact; row callbacks resolve canonical owners. */
export const LayerRowContents = memo(function LayerRowContents({
  engine,
  page,
  layer,
  assets,
  services,
  previewKey,
  attachmentTarget,
  expanded,
  renaming,
  parentLocked,
  locked,
  lockDescription,
  drop,
  rejected,
  anchor,
  run,
  onToggle,
  onExpand,
  onRename,
  onCancelRename,
  onLock,
  onVisibility,
}: {
  engine: EnginePort;
  page: Composition;
  layer: Layer;
  assets: Project["assets"];
  services?: Pick<EditorServices, "previewExport">;
  previewKey: string;
  attachmentTarget: AttachmentTarget | null;
  expanded: boolean;
  renaming: boolean;
  parentLocked: boolean;
  locked: boolean;
  lockDescription: string;
  drop?: LayerDropPosition;
  rejected?: LayerDropRejection;
  anchor: RefObject<HTMLDivElement | null>;
  run: (task: () => void) => void;
  onToggle: () => void;
  onExpand: () => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
  onLock: () => void;
  onVisibility: () => void;
}) {
  const { t } = useTranslation();
  const expandable = layer.kind === "group" || !!layer.effects.length || !!layer.mask;
  return (
    <>
      {expandable && (
        <button
          className="group-chevron"
          aria-label={layer.name}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
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
          onBlur={(event) => onRename(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") onRename(event.currentTarget.value);
            if (event.key === "Escape") onCancelRename();
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
          onExpand={onExpand}
          run={run}
        />
      )}
      {(drop || rejected) && <DropCue anchor={anchor} position={drop} reason={rejected} />}
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
          onClick={onLock}
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
          onClick={onVisibility}
        >
          {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </IconButton>
      </div>
    </>
  );
});

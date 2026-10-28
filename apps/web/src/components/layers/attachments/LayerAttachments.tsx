import { memo, type RefObject } from "react";
import { Eye, EyeOff, Trash2, ScanLine } from "lucide-react";
import {
  getEffectDefinition,
  createLayerGeometryIndex,
  type Composition,
  type EnginePort,
  type Layer,
  type SessionSnapshot,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/button";
import { IconButton } from "../../shared/IconButton";
import { useLayerPreview } from "../controls/use-layer-preview";
import { EffectPopover } from "./EffectPopover";
import { MaskPopover } from "./MaskPopover";
import { activateLayerPage } from "../tree/activation";
import {
  attachmentSelection,
  capturePresentationDelete,
} from "../../../state/selection/attachments";
const MIME = "application/x-musart-effect";
export interface EffectDragSession {
  snapshot: SessionSnapshot;
  layerId: string;
  effectId: string;
}
/** One virtual tree child represents exactly one existing effect or mask reference. */
export const LayerAttachments = memo(function LayerAttachments({
  engine,
  page,
  layer,
  depth,
  top,
  effectId,
  mask: showMask,
  selected = false,
  run,
  drag,
}: {
  engine: EnginePort;
  page: Composition;
  layer: Layer;
  depth: number;
  top: number;
  effectId?: string;
  mask: boolean;
  selected?: boolean;
  run: (task: () => void) => void;
  drag: RefObject<EffectDragSession | null>;
}) {
  const { t } = useTranslation();
  const edit = useLayerPreview(engine, page, [layer.id], run);
  const disabled = createLayerGeometryIndex(page).isLocked(layer.id);
  const mask = layer.mask,
    effect = layer.effects.find((item) => item.id === effectId);
  function selectAttachment() {
    return attachmentSelection(engine).select(
      page,
      showMask
        ? { kind: "mask", pageId: page.id, layerId: layer.id }
        : { kind: "effect", pageId: page.id, layerId: layer.id, effectId: effectId! },
    );
  }
  const style = {
    position: "absolute" as const,
    top,
    left: 0,
    right: 0,
    paddingLeft: 12 + depth * 16,
  };
  if (showMask)
    return (
      mask && (
        <div
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={selected}
          data-mask-for={layer.id}
          data-layer-tree-key={`mask:${layer.id}`}
          className={`layer-attachment-row ${selected ? "is-selected" : ""} ${mask.enabled ? "" : "is-hidden"}`}
          style={style}
          onClickCapture={selectAttachment}
          onContextMenu={selectAttachment}
        >
          <MaskPopover engine={engine} page={page} layer={layer} run={run}>
            <Button variant="ghost" className="attachment-name">
              <span className="mask-avatar">
                <ScanLine size={12} />
              </span>
              {t("mask")}
              {mask.layerId && (
                <small> · {page.layers.find((item) => item.id === mask.layerId)?.name}</small>
              )}
            </Button>
          </MaskPopover>
          <div className="attachment-actions">
            <IconButton
              disabled={disabled}
              label={t("enableMask")}
              onClick={() =>
                edit.command({
                  type: "updateMask",
                  targetId: layer.id,
                  patch: { enabled: !mask.enabled },
                })
              }
            >
              {mask.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
            </IconButton>
            <IconButton
              disabled={disabled}
              label={t("removeMask")}
              onClick={() => run(capturePresentationDelete(engine))}
            >
              <Trash2 size={12} />
            </IconButton>
          </div>
        </div>
      )
    );
  if (!effect) return null;
  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      data-effect-id={effect.id}
      data-layer-tree-key={`effect:${layer.id.length}:${layer.id}:${effect.id}`}
      className={`layer-attachment-row ${selected ? "is-selected" : ""} ${effect.enabled ? "" : "is-hidden"}`}
      style={style}
      onClickCapture={selectAttachment}
      onContextMenu={selectAttachment}
      draggable={!disabled}
      onDragStart={(event) => {
        event.stopPropagation();
        if (!activateLayerPage(engine, page)) {
          event.preventDefault();
          return;
        }
        selectAttachment();
        drag.current = { snapshot: engine.getSnapshot(), layerId: layer.id, effectId: effect.id };
        event.dataTransfer.setData(MIME, effect.id);
      }}
      onDragEnd={() => {
        drag.current = null;
      }}
      onDragOver={(event) => {
        if (drag.current?.layerId === layer.id && !disabled) {
          event.stopPropagation();
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const session = drag.current,
          source = event.dataTransfer.getData(MIME),
          original = layer.effects.find((item) => item.id === source),
          snapshot = engine.getSnapshot();
        drag.current = null;
        if (
          !session ||
          session.layerId !== layer.id ||
          session.effectId !== source ||
          session.snapshot.project !== snapshot.project ||
          session.snapshot.pageId !== snapshot.pageId ||
          session.snapshot.revision !== snapshot.revision ||
          !original ||
          original.id === effect.id
        )
          return;
        const effects = layer.effects.filter((item) => item.id !== source);
        effects.splice(
          effects.findIndex((item) => item.id === effect.id),
          0,
          original,
        );
        if (effects.some((item, at) => item.id !== layer.effects[at]!.id)) edit.commit({ effects });
      }}
    >
      <EffectPopover engine={engine} page={page} layer={layer} effectId={effect.id} run={run}>
        <Button variant="ghost" className="attachment-name">
          <span className="effect-avatar">fx</span>
          {t(getEffectDefinition(effect.type).nameKey)}
        </Button>
      </EffectPopover>
      <div className="attachment-actions">
        <IconButton
          disabled={disabled}
          label={t(effect.enabled ? "disableEffect" : "enableEffect")}
          onClick={() =>
            edit.commit({
              effects: layer.effects.map((item) =>
                item.id === effect.id ? { ...item, enabled: !item.enabled } : item,
              ),
            })
          }
        >
          {effect.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
        </IconButton>
        <IconButton
          disabled={disabled}
          label={t("removeEffect")}
          onClick={() => run(capturePresentationDelete(engine))}
        >
          <Trash2 size={12} />
        </IconButton>
      </div>
    </div>
  );
});

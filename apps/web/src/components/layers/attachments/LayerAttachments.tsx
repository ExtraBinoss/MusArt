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
  run: (task: () => void) => void;
  drag: RefObject<EffectDragSession | null>;
}) {
  const { t } = useTranslation();
  const edit = useLayerPreview(engine, page, [layer.id], run);
  const disabled = createLayerGeometryIndex(page).isLocked(layer.id);
  const mask = layer.mask,
    effect = layer.effects.find((item) => item.id === effectId);
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
          data-mask-for={layer.id}
          className={`layer-attachment-row ${mask.enabled ? "" : "is-hidden"}`}
          style={style}
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
              onClick={() => edit.command({ type: "removeLayerMask", targetId: layer.id })}
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
      data-effect-id={effect.id}
      className={`layer-attachment-row ${effect.enabled ? "" : "is-hidden"}`}
      style={style}
      draggable={!disabled}
      onDragStart={(event) => {
        event.stopPropagation();
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
          onClick={() =>
            edit.commit({ effects: layer.effects.filter((item) => item.id !== effect.id) })
          }
        >
          <Trash2 size={12} />
        </IconButton>
      </div>
    </div>
  );
});

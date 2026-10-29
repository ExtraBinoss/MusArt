import { type ReactNode } from "react";
import { Eye, EyeOff, Trash2, Sun } from "lucide-react";
import {
  getEffectDefinition,
  BLEND_MODES,
  getBlendDefinition,
  createLayerGeometryIndex,
  type Composition,
  type EnginePort,
  type Layer,
  type Effect,
  EFFECT_COMPOSITE_MODES,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { Popover, PopoverTrigger, PopoverContent } from "../../ui/popover";
import { IconButton } from "../../shared/IconButton";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { SelectField } from "../../shared/SelectField";
import { EffectParameters } from "../../properties/effects/EffectParameters";
import {
  attachmentSelection,
  capturePresentationDelete,
} from "../../../state/selection/attachments";
import { attachmentDeleteKey } from "../../../state/selection/attachment-keydown";
import { useLayerPreview } from "../controls/use-layer-preview";
import { LockedLayerNotice } from "../../properties/locked/LockedLayerNotice";
import { usePopoverOwner } from "./use-popover-owner";
import { MotionFieldProvider } from "../../properties/motion/context";
import { MotionField } from "../../properties/motion/MotionField";
import { MotionValueField } from "../../properties/motion/MotionValueField";
import { MotionNumberInput } from "../../properties/motion/MotionNumberInput";
export function EffectPopover({
  engine,
  page,
  layer,
  effectId,
  run,
  children,
}: {
  engine: EnginePort;
  page: Composition;
  layer: Layer;
  effectId?: string;
  run: (task: () => void) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const owner = usePopoverOwner(
    JSON.stringify([
      engine.getSnapshot().project.id,
      page.id,
      layer.id,
      effectId ?? layer.effects[0]?.id,
    ]),
  );
  return (
    <Popover
      open={owner.open}
      onOpenChange={(open) => {
        if (!owner.onOpenChange(open)) return;
        const id = effectId ?? layer.effects[0]?.id;
        if (open && id)
          attachmentSelection(engine).select(page, {
            kind: "effect",
            pageId: page.id,
            layerId: layer.id,
            effectId: id,
          });
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        onCloseAutoFocus={owner.onCloseAutoFocus}
        side="left"
        align="start"
        className="floating-panel layer-attachment-popover"
        aria-label={`${t("effects")} · ${layer.name}`}
        onKeyDown={(event) => {
          if (attachmentDeleteKey(event.nativeEvent, engine, run)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <ScrollShadow className="layer-attachment-scroll">
          <div className="layer-attachment-viewport">
            <EffectDetails
              engine={engine}
              page={page}
              layer={layer}
              effectId={effectId}
              run={run}
            />
          </div>
        </ScrollShadow>
      </PopoverContent>
    </Popover>
  );
}
function EffectDetails({
  engine,
  page,
  layer,
  effectId,
  run,
}: {
  engine: EnginePort;
  page: Composition;
  layer: Layer;
  effectId?: string;
  run: (task: () => void) => void;
}) {
  const { t } = useTranslation();
  const edit = useLayerPreview(engine, page, [layer.id], run);
  const disabled = createLayerGeometryIndex(page).isLocked(layer.id);
  function update(effect: Effect, patch: Partial<Effect>, preview = false) {
    if (preview) edit.previewEffect(effect.id, patch);
    else edit.commitEffect(effect.id, patch);
  }
  return (
    <MotionFieldProvider editor={edit}>
      <div className="layer-effect-details">
        <LockedLayerNotice engine={engine} page={page} layers={[layer]} run={run} />
        {layer.effects
          .filter((effect) => !effectId || effect.id === effectId)
          .map((effect) => (
            <section
              key={effect.id}
              onPointerDownCapture={() =>
                attachmentSelection(engine).select(page, {
                  kind: "effect",
                  pageId: page.id,
                  layerId: layer.id,
                  effectId: effect.id,
                })
              }
              onFocusCapture={() =>
                attachmentSelection(engine).select(page, {
                  kind: "effect",
                  pageId: page.id,
                  layerId: layer.id,
                  effectId: effect.id,
                })
              }
            >
              <div className="section-title">
                <h3>{t(getEffectDefinition(effect.type).nameKey)}</h3>
                <div className="attachment-actions">
                  <MotionField
                    engine={engine}
                    target={{
                      kind: "effect",
                      layerId: layer.id,
                      effectId: effect.id,
                      property: "enabled",
                    }}
                    label={t("enableEffect")}
                    disabled={disabled}
                  >
                    <MotionValueField
                      engine={engine}
                      target={{
                        kind: "effect",
                        layerId: layer.id,
                        effectId: effect.id,
                        property: "enabled",
                      }}
                      fallback={effect.enabled}
                    >
                      {(value) => (
                        <IconButton
                          disabled={disabled}
                          label={t(value ? "disableEffect" : "enableEffect")}
                          onClick={() => update(effect, { enabled: !value })}
                        >
                          {value ? <Eye size={13} /> : <EyeOff size={13} />}
                        </IconButton>
                      )}
                    </MotionValueField>
                  </MotionField>
                  <IconButton
                    disabled={disabled}
                    label={t("removeEffect")}
                    onClick={() => run(capturePresentationDelete(engine))}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </div>
              <div className="effect-compositing">
                <MotionNumberInput
                  engine={engine}
                  target={{
                    kind: "effect",
                    layerId: layer.id,
                    effectId: effect.id,
                    property: "opacity",
                  }}
                  displayScale={100}
                  identity={effect}
                  resetValue={100}
                  label={t("opacity")}
                  scrubLabel={<Sun size={14} aria-hidden="true" />}
                  value={(effect.opacity ?? 1) * 100}
                  min={0}
                  max={100}
                  unit="%"
                  disabled={disabled}
                  onStart={edit.begin}
                  onPreview={(value) => update(effect, { opacity: value / 100 }, true)}
                  onCommit={(value) => update(effect, { opacity: value / 100 })}
                  onCancel={edit.cancel}
                />
                <MotionField
                  engine={engine}
                  target={{
                    kind: "effect",
                    layerId: layer.id,
                    effectId: effect.id,
                    property: "blendMode",
                  }}
                  label={t("blendMode")}
                  disabled={disabled}
                >
                  <MotionValueField
                    engine={engine}
                    target={{
                      kind: "effect",
                      layerId: layer.id,
                      effectId: effect.id,
                      property: "blendMode",
                    }}
                    fallback={effect.blendMode ?? "normal"}
                  >
                    {(value) => (
                      <SelectField
                        label={t("blendMode")}
                        value={String(value)}
                        disabled={disabled}
                        options={BLEND_MODES.map((mode) => ({
                          value: mode,
                          label: t(getBlendDefinition(mode).nameKey),
                        }))}
                        onPreview={(mode) =>
                          update(effect, { blendMode: mode as Effect["blendMode"] }, true)
                        }
                        onPreviewCancel={edit.cancel}
                        onValueChange={(mode) =>
                          update(effect, { blendMode: mode as Effect["blendMode"] })
                        }
                      />
                    )}
                  </MotionValueField>
                </MotionField>
              </div>
              <MotionField
                engine={engine}
                target={{
                  kind: "effect",
                  layerId: layer.id,
                  effectId: effect.id,
                  property: "composite",
                }}
                label={t("effectControls:composite")}
                disabled={disabled}
              >
                <MotionValueField
                  engine={engine}
                  target={{
                    kind: "effect",
                    layerId: layer.id,
                    effectId: effect.id,
                    property: "composite",
                  }}
                  fallback={effect.composite ?? "default"}
                >
                  {(value) => (
                    <label className="effect-select-field">
                      <span>{t("effectControls:composite")}</span>
                      <SelectField
                        label={t("effectControls:composite")}
                        value={String(value)}
                        disabled={disabled}
                        options={[
                          { value: "default", label: t("effectControls:replacement") },
                          ...EFFECT_COMPOSITE_MODES.map((value) => ({
                            value,
                            label: t(`effectControls:operation.${value}`),
                          })),
                        ]}
                        onPreview={(mode) =>
                          update(
                            effect,
                            {
                              composite:
                                mode === "default" ? undefined : (mode as Effect["composite"]),
                            },
                            true,
                          )
                        }
                        onPreviewCancel={edit.cancel}
                        onValueChange={(mode) =>
                          update(effect, {
                            composite:
                              mode === "default" ? undefined : (mode as Effect["composite"]),
                          })
                        }
                      />
                    </label>
                  )}
                </MotionValueField>
              </MotionField>
              <EffectParameters
                engine={engine}
                layerId={layer.id}
                effect={effect}
                disabled={disabled}
                onStart={edit.begin}
                onChange={(patch, preview) => update(effect, patch, preview)}
                onCancel={edit.cancel}
              />
            </section>
          ))}
      </div>
    </MotionFieldProvider>
  );
}

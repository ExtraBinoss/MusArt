import { memo, useCallback, useLayoutEffect, type ReactNode } from "react";
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
import { Popover, PopoverAnchor, PopoverTrigger, PopoverContent } from "../../ui/popover";
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
import { freezeEffectPreviews } from "../../../state/session/effect-preview";
import { resolveLayerPage, useOpenLayerPage } from "../tree/activation";
import { useLayerPopoverAnchor } from "./use-layer-popover-anchor";
import { MotionFieldProvider } from "../../properties/motion/context";
import { MotionField } from "../../properties/motion/MotionField";
import { MotionValueField } from "../../properties/motion/MotionValueField";
import { MotionNumberInput } from "../../properties/motion/MotionNumberInput";
import type { MotionEditTarget } from "../../../state/session/motion-edit";
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
  const ownerKey = JSON.stringify([
    engine.getSnapshot().project.id,
    page.id,
    layer.id,
    effectId ?? layer.effects[0]?.id,
  ]);
  const owner = usePopoverOwner(ownerKey);
  const { open: ownerOpen, onOpenChange: setOwnerOpen, isCurrent: isOwnerCurrent } = owner;
  const { trigger, virtualRef } = useLayerPopoverAnchor(ownerKey);
  const currentPage = useOpenLayerPage(engine, page, ownerOpen);
  const isCurrent = useCallback(
    () => isOwnerCurrent() && resolveLayerPage(engine, page) !== null,
    [engine, page, isOwnerCurrent],
  );
  useLayoutEffect(() => {
    if (ownerOpen && !currentPage) setOwnerOpen(false);
  }, [ownerOpen, setOwnerOpen, currentPage]);
  const runCurrent = (task: () => void) => {
    if (isCurrent())
      run(() => {
        if (isCurrent()) task();
      });
  };
  return (
    <Popover
      open={owner.open}
      onOpenChange={(open) => {
        const current = resolveLayerPage(engine, page);
        if (open && !current) return;
        if (!owner.onOpenChange(open)) return;
        const id = effectId ?? layer.effects[0]?.id;
        if (open && id && current)
          attachmentSelection(engine).select(current, {
            kind: "effect",
            pageId: page.id,
            layerId: layer.id,
            effectId: id,
          });
      }}
    >
      <PopoverAnchor virtualRef={virtualRef} />
      <PopoverTrigger ref={trigger} asChild onPointerDownCapture={owner.onTriggerPointerDown}>
        {children}
      </PopoverTrigger>
      {owner.present && (
        <PopoverContent
          portalContainer={document.body}
          onCloseAutoFocus={owner.onCloseAutoFocus}
          side="left"
          align="start"
          className="floating-panel layer-attachment-popover"
          aria-label={`${t("effects")} · ${layer.name}`}
          onKeyDown={(event) => {
            if (isCurrent() && attachmentDeleteKey(event.nativeEvent, engine, runCurrent)) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
        >
          <ScrollShadow key={owner.generation} className="layer-attachment-scroll">
            <div className="layer-attachment-viewport">
              <EffectDetails
                key={owner.generation}
                engine={engine}
                page={currentPage ?? page}
                layer={layer}
                effectId={effectId}
                run={run}
                isCurrent={isCurrent}
                registerDeactivate={owner.registerDeactivate}
              />
            </div>
          </ScrollShadow>
        </PopoverContent>
      )}
    </Popover>
  );
}
const EffectDetails = memo(function EffectDetails({
  engine,
  page,
  layer,
  effectId,
  run,
  isCurrent,
  registerDeactivate,
}: {
  engine: EnginePort;
  page: Composition;
  layer: Layer;
  effectId?: string;
  run: (task: () => void) => void;
  isCurrent: () => boolean;
  registerDeactivate: (cancel: () => void) => () => void;
}) {
  const { t } = useTranslation();
  const runCurrent = (task: () => void) => {
    if (isCurrent())
      run(() => {
        if (isCurrent()) task();
      });
  };
  const edit = useLayerPreview(engine, page, [layer.id], runCurrent);
  const cancelEdit = edit.cancel;
  useLayoutEffect(
    () =>
      registerDeactivate(() => {
        freezeEffectPreviews(engine, false);
        cancelEdit();
      }),
    [engine, cancelEdit, registerDeactivate],
  );
  const cancel = () => {
    if (isCurrent()) edit.cancel();
  };
  const begin = (target?: MotionEditTarget) => {
    const current = resolveLayerPage(engine, page);
    if (isCurrent() && current) edit.beginOnPage(current, target);
  };
  const editor = {
    begin,
    start: (target?: MotionEditTarget) => {
      if (isCurrent()) edit.start(target);
    },
  };
  const disabled = !isCurrent() || createLayerGeometryIndex(page).isLocked(layer.id);
  function update(effect: Effect, patch: Partial<Effect>, preview = false) {
    const current = resolveLayerPage(engine, page);
    if (!isCurrent() || !current) return;
    edit.beginOnPage(current);
    if (preview) edit.previewEffect(effect.id, patch);
    else edit.commitEffect(effect.id, patch);
  }
  return (
    <MotionFieldProvider editor={editor}>
      <div className="layer-effect-details">
        <LockedLayerNotice engine={engine} page={page} layers={[layer]} run={runCurrent} />
        {layer.effects
          .filter((effect) => !effectId || effect.id === effectId)
          .map((effect) => (
            <section
              key={effect.id}
              onPointerDownCapture={() => {
                const current = resolveLayerPage(engine, page);
                if (isCurrent() && current)
                  attachmentSelection(engine).select(current, {
                    kind: "effect",
                    pageId: page.id,
                    layerId: layer.id,
                    effectId: effect.id,
                  });
              }}
              onFocusCapture={() => {
                const current = resolveLayerPage(engine, page);
                if (isCurrent() && current)
                  attachmentSelection(engine).select(current, {
                    kind: "effect",
                    pageId: page.id,
                    layerId: layer.id,
                    effectId: effect.id,
                  });
              }}
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
                    onClick={() => runCurrent(capturePresentationDelete(engine))}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </div>
              <div className="effect-compositing">
                <div className="effect-parameter-row">
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
                    scrubLabel={
                      <>
                        <Sun size={14} aria-hidden="true" />
                        <span>{t("opacity")}</span>
                      </>
                    }
                    value={(effect.opacity ?? 1) * 100}
                    min={0}
                    max={100}
                    unit="%"
                    disabled={disabled}
                    onStart={begin}
                    onPreview={(value) => update(effect, { opacity: value / 100 }, true)}
                    onCommit={(value) => update(effect, { opacity: value / 100 })}
                    onCancel={cancel}
                  />
                </div>
                <MotionField
                  className="effect-property-row"
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
                      <label className="effect-select-field">
                        <span>{t("blendMode")}</span>
                        <SelectField
                          identity={effect}
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
                          onPreviewCancel={cancel}
                          onValueChange={(mode) =>
                            update(effect, { blendMode: mode as Effect["blendMode"] })
                          }
                        />
                      </label>
                    )}
                  </MotionValueField>
                </MotionField>
              </div>
              <MotionField
                className="effect-property-row"
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
                        identity={effect}
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
                        onPreviewCancel={cancel}
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
                deferOffscreen={Boolean(effectId)}
                engine={engine}
                layerId={layer.id}
                effect={effect}
                disabled={disabled}
                onStart={begin}
                onChange={(patch, preview) => update(effect, patch, preview)}
                onCancel={cancel}
              />
            </section>
          ))}
      </div>
    </MotionFieldProvider>
  );
});

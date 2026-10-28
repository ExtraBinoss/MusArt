import { type ReactNode } from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import {
  getEffectDefinition,
  BLEND_MODES,
  getBlendDefinition,
  createLayerGeometryIndex,
  type Composition,
  type EnginePort,
  type Layer,
  type Effect,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { Popover, PopoverTrigger, PopoverContent } from "../../ui/popover";
import { IconButton } from "../../shared/IconButton";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { SelectField } from "../../shared/SelectField";
import { NumberInput } from "../../shared/NumberInput";
import { EffectParameters } from "../../properties/effects/EffectParameters";
import { useLayerPreview } from "../controls/use-layer-preview";
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
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        className="floating-panel layer-attachment-popover"
        aria-label={`${t("effects")} · ${layer.name}`}
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
    const effects = layer.effects.map((item) =>
      item.id === effect.id ? { ...item, ...patch } : item,
    );
    if (preview) edit.preview({ effects });
    else edit.commit({ effects });
  }
  return (
    <div className="layer-effect-details">
      {layer.effects
        .filter((effect) => !effectId || effect.id === effectId)
        .map((effect) => (
          <section key={effect.id}>
            <div className="section-title">
              <h3>{t(getEffectDefinition(effect.type).nameKey)}</h3>
              <div className="attachment-actions">
                <IconButton
                  disabled={disabled}
                  label={t(effect.enabled ? "disableEffect" : "enableEffect")}
                  onClick={() => update(effect, { enabled: !effect.enabled })}
                >
                  {effect.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                </IconButton>
                <IconButton
                  disabled={disabled}
                  label={t("removeEffect")}
                  onClick={() =>
                    edit.commit({ effects: layer.effects.filter((item) => item.id !== effect.id) })
                  }
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
            </div>
            <div className="effect-compositing">
              <NumberInput
                label={t("opacity")}
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
              <SelectField
                label={t("blendMode")}
                value={effect.blendMode ?? "normal"}
                disabled={disabled}
                options={BLEND_MODES.map((mode) => ({
                  value: mode,
                  label: t(getBlendDefinition(mode).nameKey),
                }))}
                onPreview={(mode) =>
                  update(effect, { blendMode: mode as Effect["blendMode"] }, true)
                }
                onPreviewCancel={edit.cancel}
                onValueChange={(mode) => update(effect, { blendMode: mode as Effect["blendMode"] })}
              />
            </div>
            <EffectParameters
              effect={effect}
              disabled={disabled}
              onStart={edit.begin}
              onChange={(patch, preview) => update(effect, patch, preview)}
              onCancel={edit.cancel}
            />
          </section>
        ))}
    </div>
  );
}

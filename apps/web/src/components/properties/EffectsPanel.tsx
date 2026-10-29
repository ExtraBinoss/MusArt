import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import {
  createEffect,
  getEffectDefinition,
  type Effect,
  type Layer,
  type EnginePort,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "../ui/dropdown-menu";
import { EffectMenu } from "../layers/EffectMenu";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { IconButton } from "../shared/IconButton";
import { EffectParameters } from "./effects/EffectParameters";

export function EffectsPanel({
  layer,
  engine,
  onPatch,
  onPreview,
  onCancel,
}: {
  layer: Layer;
  engine?: EnginePort;
  onPatch(this: void, patch: Partial<Layer>): void;
  onPreview(this: void, patch: Partial<Layer>): void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  function update(effect: Effect, patch: Partial<Effect>, preview = false) {
    const effects = layer.effects.map((item) =>
      item.id === effect.id ? { ...item, ...patch } : item,
    );
    if (preview) onPreview({ effects });
    else onPatch({ effects });
  }
  function move(index: number, direction: -1 | 1) {
    const effects = [...layer.effects];
    const effect = effects[index]!;
    effects.splice(index, 1);
    effects.splice(index + direction, 0, effect);
    onPatch({ effects });
  }
  return (
    <section className="inspector-section effects-section">
      <div className="section-title">
        <h3>{t("effects")}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={t("addEffect")}>
              <Plus size={15} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <EffectMenu
              onAdd={(type) => onPatch({ effects: [...layer.effects, createEffect(type)] })}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {layer.effects.length === 0 && <p className="muted-description">{t("noEffects")}</p>}
      {layer.effects.map((effect, index) => {
        const definition = getEffectDefinition(effect.type);
        return (
          <div
            className={`effect-card ${!effect.enabled ? "effect-disabled" : ""}`}
            key={effect.id}
          >
            <div className="effect-heading">
              <span className="effect-badge">fx</span>
              <strong>{t(definition.nameKey)}</strong>
              <Switch
                checked={effect.enabled}
                aria-label={t(effect.enabled ? "disableEffect" : "enableEffect")}
                onCheckedChange={(enabled) => update(effect, { enabled })}
              />
              <IconButton
                label={t("moveEffectUp")}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={12} />
              </IconButton>
              <IconButton
                label={t("moveEffectDown")}
                disabled={index === layer.effects.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={12} />
              </IconButton>
              <IconButton
                label={t("removeEffect")}
                onClick={() =>
                  onPatch({ effects: layer.effects.filter((item) => item.id !== effect.id) })
                }
              >
                <Trash2 size={13} />
              </IconButton>
            </div>
            {effect.enabled && (
              <EffectParameters
                engine={engine}
                effect={effect}
                onChange={(patch, preview) => update(effect, patch, preview)}
                onCancel={onCancel}
              />
            )}
          </div>
        );
      })}
      {layer.effects.length > 0 && <p className="effect-footnote">{t("effectClipped")}</p>}
    </section>
  );
}

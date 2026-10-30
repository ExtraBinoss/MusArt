import { useTranslation } from "react-i18next";
import {
  resolveEffectSettings,
  type EnginePort,
  type Layer,
  type MotionAnimation,
} from "@musart/core";
import { NumberInput } from "../../shared/NumberInput";
import { SelectField } from "../../shared/SelectField";
import { InfoTooltip } from "../../shared/InfoTooltip";

/** One block stays editable text. Secondary glyph timing never creates user-managed layers. */
export function TypographyControls({
  engine,
  layer,
  animation,
  run,
  disabled,
}: {
  engine: EnginePort;
  layer: Layer;
  animation: MotionAnimation;
  run: (action: () => void) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation("animations");
  const effect = layer.effects.find(
    (effect) => effect.type === "morph" && animation.effectIds.includes(effect.id),
  );
  if (!effect) return null;
  const settings = resolveEffectSettings(effect);
  function change(key: string, value: number | string) {
    run(() =>
      engine.execute({
        type: "updateLayerPatches",
        patches: [
          {
            id: layer.id,
            patch: {
              effects: layer.effects.map((item) =>
                item.id === effect!.id
                  ? { ...item, settings: { ...settings, [key]: value } }
                  : item,
              ),
            },
          },
        ],
      }),
    );
  }
  return (
    <div className="animation-typography-controls">
      <div className="animation-typography-title">
        <span>{t("letterMotion")}</span>
        <InfoTooltip label={t("letterMotion")}>{t("letterMotionHint")}</InfoTooltip>
      </div>
      <div className="animation-instance-fields">
        <NumberInput
          label={t("letterStagger")}
          identity={effect}
          value={Number(settings.stagger) * 100}
          min={0}
          max={90}
          unit="%"
          disabled={disabled}
          onCommit={(value) => change("stagger", value / 100)}
        />
        <SelectField
          label={t("letterOrder")}
          value={String(settings.order)}
          disabled={disabled}
          options={["forward", "reverse", "center"].map((value) => ({
            value,
            label: t(`letterOrder_${value}`),
          }))}
          onValueChange={(value) => change("order", value)}
        />
      </div>
    </div>
  );
}

import "./gradient-messages";
import "./messages";
import "./library-messages";
import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  getEffectDefinition,
  getEffectParameter,
  isEffectParameterVisible,
  patchEffectParameter,
  GRADIENT_PRESETS,
  type Effect,
  type EnginePort,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { NumberInput } from "../../shared/NumberInput";
import { SelectField } from "../../shared/SelectField";
import { Switch } from "../../ui/switch";
import { EffectPlayback } from "./EffectPlayback";
import { EffectColor } from "./EffectColor";
import { IconButton } from "../../shared/IconButton";
import { freezeEffectPreviews } from "../../../state/session/effect-preview";
import { useResetFeedback } from "../../shared/use-reset-feedback";
export function EffectParameters({
  effect,
  engine,
  disabled = false,
  onChange,
  onStart,
  onCancel,
}: {
  effect: Effect;
  engine?: EnginePort;
  disabled?: boolean;
  onChange: (patch: Partial<Effect>, preview?: boolean) => void;
  onStart?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const definition = getEffectDefinition(effect.type);
  const owner = `${effect.id}:${effect.type}`;
  const [colorOwner, setColorOwner] = useState(owner);
  const [openColorKey, setOpenColorKey] = useState<string | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const feedback = useResetFeedback(root);
  if (colorOwner !== owner) {
    setColorOwner(owner);
    setOpenColorKey(null);
  }
  const defaults: Effect = { id: effect.id, type: effect.type, ...definition.defaults };
  return (
    <div ref={root} className="effect-controls reset-feedback">
      <div className="effect-controls-actions">
        <IconButton
          label={t("effectControls:resetAll")}
          disabled={disabled}
          data-effect-reset=""
          onPointerDown={(event) => {
            if (event.button === 0) event.preventDefault();
          }}
          onClick={() => {
            if (engine) freezeEffectPreviews(engine, false);
            onCancel?.();
            setOpenColorKey(null);
            setResetVersion((version) => version + 1);
            const changed =
              definition.parameters.some(
                (parameter) =>
                  getEffectParameter(effect, parameter) !== getEffectParameter(defaults, parameter),
              ) ||
              (effect.opacity ?? 1) !== 1 ||
              (effect.blendMode ?? "normal") !== "normal" ||
              effect.composite !== undefined;
            if (changed)
              onChange(
                {
                  ...definition.defaults,
                  enabled: effect.enabled,
                  settings: defaults.settings ? { ...defaults.settings } : undefined,
                  time: defaults.time,
                  opacity: 1,
                  blendMode: "normal",
                  composite: undefined,
                },
                false,
              );
            if (!matchMedia("(prefers-reduced-motion: reduce)").matches) feedback();
          }}
        >
          <RotateCcw size={14} aria-hidden="true" />
        </IconButton>
      </div>
      {engine &&
        getEffectDefinition(effect.type).parameters.some(
          (p) => p.key === "time" && p.scope !== "settings",
        ) && (
          <EffectPlayback
            engine={engine}
            effect={effect}
            disabled={disabled}
            onChange={onChange}
            onStart={onStart}
            onCancel={onCancel}
          />
        )}
      {getEffectDefinition(effect.type)
        .parameters.filter((parameter) => isEffectParameterVisible(effect, parameter))
        .map((parameter) => {
          const label = t(parameter.labelKey);
          const value = getEffectParameter(effect, parameter);
          const change = (next: number | boolean | string, preview = false) =>
            onChange(patchEffectParameter(effect, parameter, next), preview);
          if (parameter.kind === "boolean")
            return (
              <label className="switch-row" key={`${parameter.key}:${resetVersion}`}>
                <span>{label}</span>
                <Switch
                  disabled={disabled}
                  checked={Boolean(value)}
                  aria-label={label}
                  onCheckedChange={(next) => change(next)}
                />
              </label>
            );
          if (parameter.kind === "select")
            return (
              <label className="effect-select-field" key={`${parameter.key}:${resetVersion}`}>
                <span>{label}</span>
                <SelectField
                  label={label}
                  value={String(value)}
                  disabled={disabled}
                  onValueChange={(next) => change(next)}
                  options={parameter.options.map((option) => {
                    const preset =
                      parameter.key === "preset"
                        ? GRADIENT_PRESETS.find((item) => item.id === option.value)
                        : undefined;
                    return {
                      value: option.value,
                      label: (
                        <span className="effect-preset-choice">
                          {preset && (
                            <span
                              aria-hidden="true"
                              className="effect-preset-swatch"
                              style={{
                                background: `linear-gradient(100deg, ${preset.colors.join(",")})`,
                              }}
                            />
                          )}
                          {t(option.labelKey)}
                        </span>
                      ),
                    };
                  })}
                />
              </label>
            );
          if (parameter.kind === "color")
            return (
              <EffectColor
                key={`${parameter.key}:${resetVersion}`}
                identity={`${effect.id}:${effect.type}:${parameter.key}`}
                label={label}
                value={String(value)}
                open={openColorKey === parameter.key}
                onOpenChange={(open) =>
                  setOpenColorKey((current) =>
                    open ? parameter.key : current === parameter.key ? null : current,
                  )
                }
                resetValue={String(getEffectParameter(defaults, parameter))}
                onReset={() => {
                  onCancel?.();
                  change(getEffectParameter(defaults, parameter));
                }}
                disabled={disabled}
                onStart={onStart}
                onPreview={(next) => change(next, true)}
                onCommit={(next) => change(next)}
                onCancel={onCancel}
              />
            );
          return (
            <NumberInput
              key={`${parameter.key}:${resetVersion}`}
              identity={effect}
              label={label}
              value={Number(value) * parameter.displayScale}
              resetValue={() =>
                Number(
                  getEffectParameter(
                    {
                      id: effect.id,
                      type: effect.type,
                      ...getEffectDefinition(effect.type).defaults,
                    },
                    parameter,
                  ),
                ) * parameter.displayScale
              }
              disabled={disabled}
              min={parameter.min * parameter.displayScale}
              max={parameter.max * parameter.displayScale}
              step={parameter.step * parameter.displayScale}
              unit={parameter.unit}
              onStart={onStart}
              onPreview={(next) => change(next / parameter.displayScale, true)}
              onCancel={onCancel}
              onCommit={(next) => change(next / parameter.displayScale)}
            />
          );
        })}
    </div>
  );
}

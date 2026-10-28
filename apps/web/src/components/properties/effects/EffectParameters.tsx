import "./gradient-messages";
import {
  getEffectDefinition,
  getEffectParameter,
  isEffectParameterVisible,
  patchEffectParameter,
  GRADIENT_PRESETS,
  type Effect,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { NumberInput } from "../../shared/NumberInput";
import { SelectField } from "../../shared/SelectField";
import { Switch } from "../../ui/switch";
import { EffectColor } from "./EffectColor";
export function EffectParameters({
  effect,
  disabled = false,
  onChange,
  onStart,
  onCancel,
}: {
  effect: Effect;
  disabled?: boolean;
  onChange: (patch: Partial<Effect>, preview?: boolean) => void;
  onStart?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="effect-controls">
      {getEffectDefinition(effect.type)
        .parameters.filter((parameter) => isEffectParameterVisible(effect, parameter))
        .map((parameter) => {
          const value = getEffectParameter(effect, parameter),
            label = t(parameter.labelKey);
          const change = (next: number | boolean | string, preview = false) =>
            onChange(patchEffectParameter(effect, parameter, next), preview);
          if (parameter.kind === "boolean")
            return (
              <label className="switch-row" key={parameter.key}>
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
              <label className="effect-select-field" key={parameter.key}>
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
                key={parameter.key}
                label={label}
                value={String(value)}
                disabled={disabled}
                onStart={onStart}
                onPreview={(next) => change(next, true)}
                onCommit={(next) => change(next)}
                onCancel={onCancel}
              />
            );
          return (
            <NumberInput
              key={`${parameter.key}:${value}`}
              label={label}
              value={Number(value) * parameter.displayScale}
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

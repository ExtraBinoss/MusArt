import "./gradient-messages";
import "./messages";
import "./library-messages";
import { memo, useCallback, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  getEffectDefinition,
  getEffectParameter,
  isEffectParameterVisible,
  patchEffectParameter,
  GRADIENT_PRESETS,
  type Effect,
  type EffectParameter,
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
import { useParameterWindow } from "./use-parameter-window";
export function EffectParameters({
  effect,
  engine,
  disabled = false,
  onChange,
  onStart,
  onCancel,
  deferOffscreen = false,
}: {
  effect: Effect;
  engine?: EnginePort;
  disabled?: boolean;
  onChange: (patch: Partial<Effect>, preview?: boolean) => void;
  onStart?: () => void;
  onCancel?: () => void;
  deferOffscreen?: boolean;
}) {
  const { t } = useTranslation();
  const definition = getEffectDefinition(effect.type);
  const owner = `${effect.id}:${effect.type}`;
  const [colorOwner, setColorOwner] = useState(owner);
  const [openColorKey, setOpenColorKey] = useState<string | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const changeColorOpen = useCallback(
    (key: string, open: boolean) => {
      setOpenColorKey((current) => (open ? key : current === key ? null : current));
    },
    [setOpenColorKey],
  );
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const feedback = useResetFeedback(root);
  const parameters = definition.parameters.filter((parameter) =>
    isEffectParameterVisible(effect, parameter),
  );
  const window = useParameterWindow(list, owner, parameters.length, deferOffscreen);
  if (colorOwner !== owner) {
    setColorOwner(owner);
    setOpenColorKey(null);
  }
  const defaults: Effect = { id: effect.id, type: effect.type, ...definition.defaults };

  return (
    <div
      ref={root}
      className="effect-controls reset-feedback"
      data-effect-parameter-count={parameters.length}
    >
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
      <div
        ref={list}
        className={`effect-parameter-list ${window.virtual ? "is-virtual" : ""}`}
        style={window.virtual ? { height: window.height } : undefined}
        onFocusCapture={window.remember}
        onPointerDownCapture={(event) => {
          window.remember(event);
          if (event.button !== 0 || !openColorKey) return;
          const trigger = (event.target as Element).closest('[data-slot="popover-trigger"]');
          const row = trigger?.closest<HTMLElement>("[data-parameter-index]");
          const parameter = row && parameters[Number(row.dataset.parameterIndex)];
          // React's discrete pointer event closes the old editor before native focus/blur can commit it.
          if (parameter?.kind === "color" && parameter.key !== openColorKey) setOpenColorKey(null);
        }}
        onKeyDownCapture={window.keyDown}
      >
        {window.indices.map((index) => {
          const parameter = parameters[index]!;
          return (
            <div
              key={`${parameter.key}:${resetVersion}`}
              className="effect-parameter-row"
              data-parameter-index={index}
              style={window.virtual ? { top: window.rowTop(index) } : undefined}
            >
              <ParameterField
                effect={effect}
                parameter={parameter}
                disabled={disabled}
                t={t}
                colorOpen={openColorKey === parameter.key}
                onColorOpenChange={changeColorOpen}
                onChange={onChange}
                onStart={onStart}
                onCancel={onCancel}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Retain mounted controls through window and focus updates; canonical edits still rebind every field. */
const ParameterField = memo(function ParameterField({
  effect,
  parameter,
  disabled,
  t,
  colorOpen,
  onColorOpenChange,
  onChange,
  onStart,
  onCancel,
}: {
  effect: Effect;
  parameter: EffectParameter;
  disabled: boolean;
  t: ReturnType<typeof useTranslation>["t"];
  colorOpen: boolean;
  onColorOpenChange: (key: string, open: boolean) => void;
  onChange: (patch: Partial<Effect>, preview?: boolean) => void;
  onStart?: () => void;
  onCancel?: () => void;
}) {
  const defaults: Effect = {
    id: effect.id,
    type: effect.type,
    ...getEffectDefinition(effect.type).defaults,
  };
  const label = t(parameter.labelKey);
  const value = getEffectParameter(effect, parameter);
  const change = (next: number | boolean | string, preview = false) =>
    onChange(patchEffectParameter(effect, parameter, next), preview);
  if (parameter.kind === "boolean")
    return (
      <label className="switch-row">
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
      <label className="effect-select-field">
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
              label: preset ? (
                <span className="effect-preset-choice">
                  <span
                    aria-hidden="true"
                    className="effect-preset-swatch"
                    style={{
                      background: `linear-gradient(100deg, ${preset.colors.join(",")})`,
                    }}
                  />
                  {t(option.labelKey)}
                </span>
              ) : (
                t(option.labelKey)
              ),
            };
          })}
        />
      </label>
    );
  if (parameter.kind === "color")
    return (
      <EffectColor
        identity={`${effect.id}:${effect.type}:${parameter.key}`}
        label={label}
        value={String(value)}
        open={colorOpen}
        onOpenChange={(open) => onColorOpenChange(parameter.key, open)}
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
});

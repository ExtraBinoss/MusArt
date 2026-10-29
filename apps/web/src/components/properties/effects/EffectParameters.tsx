import "./gradient-messages";
import "./messages";
import "./library-messages";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { RotateCcw } from "lucide-react";
import {
  getEffectDefinition,
  getEffectParameter,
  isEffectParameterVisible,
  patchEffectParameter,
  GRADIENT_PRESETS,
  type Effect,
  type EnginePort,
  type MotionPropertyTarget,
} from "@musart/core";
import { useTranslation } from "react-i18next";
import { MotionNumberInput as NumberInput } from "../motion/MotionNumberInput";
import { MotionField } from "../motion/MotionField";
import { MotionValueField } from "../motion/MotionValueField";
import { createMotionTransport } from "../../../services/motion/transport";
import { motionTimeChanges } from "../../../state/session/motion-edit";
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
  layerId,
  disabled = false,
  onChange,
  onStart,
  onCancel,
}: {
  effect: Effect;
  engine?: EnginePort;
  layerId?: string;
  disabled?: boolean;
  onChange: (patch: Partial<Effect>, preview?: boolean) => void;
  onStart?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const definition = getEffectDefinition(effect.type);
  const snapshot = engine?.getSnapshot();
  const ownerPage = snapshot
    ? snapshot.project.pages.find((page) => page.id === snapshot.pageId)
    : undefined;
  const ownLayerId =
    layerId ??
    ownerPage?.layers.find((layer) => layer.effects.some((item) => item.id === effect.id))?.id;
  const transport = engine ? createMotionTransport(engine) : null;
  const displayed = useCallback(
    () =>
      transport
        ?.readFrame()
        ?.layers.find((layer) => layer.id === ownLayerId)
        ?.effects.find((item) => item.id === effect.id) ?? effect,
    [transport, ownLayerId, effect],
  );
  const shape = useCallback(
    () =>
      definition.parameters
        .filter((parameter) => isEffectParameterVisible(displayed(), parameter))
        .map((parameter) => `${parameter.scope}:${parameter.key}`)
        .join("|"),
    [definition, displayed],
  );
  useSyncExternalStore(transport?.subscribe ?? noSubscription, shape, shape);
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
                  getEffectParameter(displayed(), parameter) !==
                  getEffectParameter(defaults, parameter),
              ) ||
              (displayed().opacity ?? 1) !== 1 ||
              (displayed().blendMode ?? "normal") !== "normal" ||
              displayed().composite !== undefined;
            if (changed)
              onChange(
                {
                  ...definition.defaults,
                  enabled: displayed().enabled,
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
        .parameters.filter((parameter) => isEffectParameterVisible(displayed(), parameter))
        .map((parameter) => {
          const label = t(parameter.labelKey);
          const value = getEffectParameter(effect, parameter);
          const target: MotionPropertyTarget | undefined = ownLayerId
            ? parameter.scope === "settings"
              ? {
                  kind: "effectSetting",
                  layerId: ownLayerId,
                  effectId: effect.id,
                  property: parameter.key,
                }
              : {
                  kind: "effect",
                  layerId: ownLayerId,
                  effectId: effect.id,
                  property: parameter.key as Extract<
                    MotionPropertyTarget,
                    { kind: "effect" }
                  >["property"],
                }
            : undefined;
          const change = (next: number | boolean | string, preview = false) =>
            onChange(patchEffectParameter(effect, parameter, next), preview);
          if (parameter.kind === "boolean")
            return (
              <MotionField
                engine={engine}
                target={target}
                label={label}
                disabled={disabled}
                key={`${parameter.key}:${resetVersion}`}
              >
                <MotionValueField engine={engine} target={target} fallback={value}>
                  {(live) => (
                    <label className="switch-row">
                      <span>{label}</span>
                      <Switch
                        disabled={disabled}
                        checked={Boolean(live)}
                        aria-label={label}
                        onCheckedChange={(next) => change(next)}
                      />
                    </label>
                  )}
                </MotionValueField>
              </MotionField>
            );
          if (parameter.kind === "select")
            return (
              <MotionField
                engine={engine}
                target={target}
                label={label}
                disabled={disabled}
                key={`${parameter.key}:${resetVersion}`}
              >
                <MotionValueField engine={engine} target={target} fallback={value}>
                  {(live) => (
                    <label className="effect-select-field">
                      <span>{label}</span>
                      <SelectField
                        label={label}
                        value={String(live)}
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
                  )}
                </MotionValueField>
              </MotionField>
            );
          if (parameter.kind === "color")
            return (
              <MotionField
                engine={engine}
                target={target}
                label={label}
                disabled={disabled}
                key={`${parameter.key}:${resetVersion}`}
              >
                <MotionValueField engine={engine} target={target} fallback={value}>
                  {(live) => (
                    <EffectColor
                      invalidation={engine ? motionTimeChanges(engine) : undefined}
                      identity={`${effect.id}:${effect.type}:${parameter.key}`}
                      label={label}
                      value={String(live)}
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
                  )}
                </MotionValueField>
              </MotionField>
            );
          return (
            <NumberInput
              engine={engine}
              target={target}
              displayScale={parameter.displayScale}
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
function noSubscription() {
  return () => {};
}

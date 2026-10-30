import {
  getEffectDefinition,
  type AnimationChannel,
  type MotionAnimationPreset,
} from "@musart/core";
import type { TFunction } from "i18next";

const layerLabels: Record<string, string> = {
  x: "horizontalMove",
  y: "verticalMove",
  scaleX: "horizontalScale",
  scaleY: "verticalScale",
};
const motionLabels: Record<string, string> = {
  "fillGradient.angle": "gradientAngle",
  "fillGradient.kind": "gradientKind",
};
const pixelProperties = new Set([
  "x",
  "y",
  "width",
  "height",
  "strokeWidth",
  "radius",
  "fontSize",
  "letterSpacing",
]);

/** Presentation units convert back to the original portable values before every command. */
export function channelPresentation(
  channel: AnimationChannel,
  preset: MotionAnimationPreset,
  t: TFunction,
) {
  const property = channel.target.property;
  const effect = channel.target.kind === "layer" ? undefined : preset.effects[channel.target.slot];
  const definition = effect && getEffectDefinition(effect.type);
  const parameter = definition?.parameters.find(
    (item) =>
      item.key === property &&
      (item.scope === "settings") === (channel.target.kind === "effectSetting"),
  );
  const name =
    channel.target.kind === "layer"
      ? layerLabels[property]
        ? t(layerLabels[property], { ns: "animations" })
        : t(motionLabels[property] ?? property, { ns: "motion" })
      : `${definition ? t(definition.nameKey, { ns: "translation" }) : t("effect", { ns: "animations" })} · ${parameter ? t(parameter.labelKey, { ns: "translation" }) : t(property, { ns: "motion", defaultValue: property })}`;
  const percent =
    !!channel.unit ||
    ["scaleX", "scaleY", "opacity"].includes(property) ||
    (channel.target.kind === "effect" && property === "amount") ||
    (channel.target.kind === "effectSetting" && property === "progress");
  const factor = percent ? 100 : 1;
  const unit = percent
    ? "%"
    : property === "rotation" || property === "fillGradient.angle"
      ? "°"
      : channel.target.kind === "layer" && pixelProperties.has(property)
        ? "px"
        : undefined;
  const hint = channel.unit
    ? t(`relative.${channel.unit}`, { ns: "animations" })
    : (property === "scaleX" || property === "scaleY") && channel.operation !== "add"
      ? t("scaleHint", { ns: "animations" })
      : t(`operation.${channel.operation}`, { ns: "animations" });
  return { name, factor, unit, hint };
}

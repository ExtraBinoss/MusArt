import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { LockKeyhole, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  AnimationChannel as Channel,
  MotionAnimation,
  MotionAnimationPreset,
} from "@musart/core";
import { NumberInput } from "../../shared/NumberInput";
import { InfoTooltip } from "../../shared/InfoTooltip";
import { SelectField } from "../../shared/SelectField";
import { Button } from "../../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { channelPresentation } from "./channel-presentation";
import "./messages";
import "../messages";

export function AnimationChannel({
  animation,
  channel,
  index,
  edit,
}: {
  animation: MotionAnimation;
  channel: Channel;
  index: number;
  edit: (change: (preset: MotionAnimationPreset) => void) => void;
}) {
  const { t } = useTranslation(["animations", "motion"]);
  const reduced = !!useReducedMotion();
  const [addedAt, setAddedAt] = useState<number | null>(null);
  const { name, hint, unit, factor } = channelPresentation(channel, animation.preset, t);
  const lastChannel = animation.preset.channels.length === 1;
  const points = channel.points;
  function add() {
    let gap = 1;
    for (let i = 2; i < points.length; i++)
      if (points[i]!.at - points[i - 1]!.at > points[gap]!.at - points[gap - 1]!.at) gap = i;
    const left = points[gap - 1]!,
      right = points[gap]!,
      at = (left.at + right.at) / 2;
    setAddedAt(at);
    edit((preset) =>
      preset.channels[index]!.points.splice(gap, 0, {
        at,
        value:
          typeof left.value === "number" && typeof right.value === "number"
            ? (left.value + right.value) / 2
            : left.value,
        ...(right.easing ? { easing: right.easing } : {}),
      }),
    );
  }
  return (
    <section className="animation-detail-channel" aria-label={name}>
      <div className="animation-channel-heading">
        <div className="animation-channel-title">
          <strong>{name}</strong>
          <InfoTooltip label={t("aboutProperty", { name })}>{hint}</InfoTooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={lastChannel ? 0 : undefined}>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  className="animation-delete-action"
                  aria-label={t("removeProperty", { name })}
                  disabled={lastChannel}
                  onClick={() =>
                    edit((preset) => {
                      preset.channels.splice(index, 1);
                    })
                  }
                >
                  <Trash2 size={12} />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {lastChannel ? t("lastPropertyHint") : t("removeProperty", { name })}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="animation-channel-points">
        {points.map((point, pi) => {
          const endpoint = pi === 0 || pi === points.length - 1;
          const label =
            pi === 0 ? t("from") : pi === points.length - 1 ? t("to") : t("step", { index: pi });
          return (
            <motion.div
              key={point.at}
              className="animation-point"
              data-point-at={point.at}
              initial={
                addedAt === point.at && !reduced
                  ? { height: 0, opacity: 0, filter: "blur(6px)", y: 6 }
                  : false
              }
              animate={{ height: "auto", opacity: 1, filter: "blur(0px)", y: 0 }}
              transition={{ duration: reduced ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => {
                if (addedAt === point.at) setAddedAt(null);
              }}
            >
              <div className="animation-point-heading">
                <span>{label}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {endpoint ? (
                      <span
                        tabIndex={0}
                        className="animation-point-lock"
                        aria-label={t("fixedEndpoint")}
                      >
                        <LockKeyhole size={11} />
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="animation-delete-action"
                        aria-label={t("deleteStep", { index: pi })}
                        onClick={() =>
                          edit((preset) => {
                            preset.channels[index]!.points.splice(pi, 1);
                          })
                        }
                      >
                        <Trash2 size={11} />
                      </Button>
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    {endpoint ? t("endpointHint") : t("deleteStep", { index: pi })}
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="animation-detail-point">
                <NumberInput
                  identity={animation}
                  label={t("pointTime")}
                  value={point.at * 100}
                  min={pi ? points[pi - 1]!.at * 100 + 0.01 : 0}
                  max={pi < points.length - 1 ? points[pi + 1]!.at * 100 - 0.01 : 100}
                  disabled={endpoint}
                  unit="%"
                  onCommit={(value) =>
                    edit((preset) => {
                      preset.channels[index]!.points[pi]!.at = value / 100;
                    })
                  }
                />
                {typeof point.value === "number" ? (
                  <NumberInput
                    identity={animation}
                    label={t("value")}
                    value={point.value * factor}
                    resetValue={channel.operation === "multiply" ? factor : 0}
                    min={-1000000 * factor}
                    max={1000000 * factor}
                    step={factor === 100 ? 1 : 0.01}
                    unit={unit}
                    onCommit={(value) =>
                      edit((preset) => {
                        preset.channels[index]!.points[pi]!.value = value / factor;
                      })
                    }
                  />
                ) : (
                  <span className="animation-point-value">{String(point.value)}</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      <div className="animation-channel-controls">
        <div className="animation-channel-easing">
          <span>{t("curve")}</span>
          <SelectField
            label={t("curve")}
            className="animation-curve-select"
            contentClassName="animation-curve-menu"
            side="bottom"
            value={points[1]?.easing?.type ?? "linear"}
            options={[
              { value: "linear", label: t("linear") },
              { value: "cubicBezier", label: t("easeOut") },
              { value: "spring", label: t("spring") },
              { value: "hold", label: t("hold") },
            ]}
            onValueChange={(type) =>
              edit((preset) => {
                for (const point of preset.channels[index]!.points)
                  point.easing =
                    type === "spring"
                      ? { type: "spring", bounce: 0.35, response: 12 }
                      : type === "cubicBezier"
                        ? { type: "cubicBezier", x1: 0.16, y1: 1, x2: 0.3, y2: 1 }
                        : type === "hold"
                          ? { type: "hold" }
                          : { type: "linear" };
              })
            }
          />
        </div>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={points.length >= 256}
          onClick={add}
        >
          <Plus size={11} />
          {t("addPoint")}
        </Button>
      </div>
    </section>
  );
}

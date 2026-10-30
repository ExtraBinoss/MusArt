import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort, MotionAnimation, MotionAnimationPreset } from "@musart/core";
import { NumberInput } from "../../shared/NumberInput";
import { Button } from "../../ui/button";
import { SelectField } from "../../shared/SelectField";

/** Detail edits change the authoritative channels, never a generated duplicate keyframe set. */
export function AnimationDetails({
  engine,
  animation,
  run,
}: {
  engine: EnginePort;
  animation: MotionAnimation;
  run: (action: () => void) => void;
}) {
  const { t } = useTranslation("animations");
  function edit(change: (preset: MotionAnimationPreset) => void) {
    run(() => {
      const preset = structuredClone(animation.preset);
      change(preset);
      engine.execute({
        type: "updateMotionAnimation",
        animationId: animation.id,
        patch: { preset },
      });
    });
  }
  return (
    <div className="animation-details">
      {animation.preset.channels.map((channel, ci) => (
        <div className="animation-detail-channel" key={ci}>
          <strong>
            {channel.target.property}
            {channel.target.kind !== "layer" ? ` · ${channel.target.slot + 1}` : ""}
            {channel.unit ? ` (${channel.unit})` : ""}
          </strong>
          {channel.points.map((point, pi) => (
            <div className="animation-detail-point" key={`${pi}:${point.at}`}>
              <NumberInput
                identity={animation}
                label={t("progress")}
                value={point.at * 100}
                min={pi ? channel.points[pi - 1]!.at * 100 + 0.01 : 0}
                max={pi < channel.points.length - 1 ? channel.points[pi + 1]!.at * 100 - 0.01 : 100}
                disabled={pi === 0 || pi === channel.points.length - 1}
                unit="%"
                onCommit={(value) =>
                  edit((preset) => {
                    preset.channels[ci]!.points[pi]!.at = value / 100;
                  })
                }
              />
              {typeof point.value === "number" ? (
                <NumberInput
                  identity={animation}
                  label={t("value")}
                  value={point.value}
                  min={-1000000}
                  max={1000000}
                  step={0.01}
                  onCommit={(value) =>
                    edit((preset) => {
                      preset.channels[ci]!.points[pi]!.value = value;
                    })
                  }
                />
              ) : (
                <span>{String(point.value)}</span>
              )}
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={t("deletePoint")}
                disabled={pi === 0 || pi === channel.points.length - 1}
                onClick={() =>
                  edit((preset) => {
                    preset.channels[ci]!.points.splice(pi, 1);
                  })
                }
              >
                <Trash2 size={11} />
              </Button>
            </div>
          ))}
          <SelectField
            label={t("curve")}
            value={channel.points[1]?.easing?.type ?? "linear"}
            options={[
              { value: "linear", label: t("linear") },
              { value: "cubicBezier", label: t("easeOut") },
              { value: "spring", label: t("spring") },
              { value: "hold", label: t("hold") },
            ]}
            onValueChange={(type) =>
              edit((preset) => {
                for (const point of preset.channels[ci]!.points)
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
          <Button
            size="xs"
            variant="ghost"
            onClick={() =>
              edit((preset) => {
                const points = preset.channels[ci]!.points;
                let gap = 1;
                for (let i = 2; i < points.length; i++)
                  if (points[i]!.at - points[i - 1]!.at > points[gap]!.at - points[gap - 1]!.at)
                    gap = i;
                const left = points[gap - 1]!,
                  right = points[gap]!;
                points.splice(gap, 0, {
                  at: (left.at + right.at) / 2,
                  value:
                    typeof left.value === "number" && typeof right.value === "number"
                      ? (left.value + right.value) / 2
                      : left.value,
                  ...(right.easing ? { easing: right.easing } : {}),
                });
              })
            }
          >
            <Plus size={11} />
            {t("addPoint")}
          </Button>
        </div>
      ))}
    </div>
  );
}

import { useRef, useState } from "react";
import { Plus, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { sampleGradientColor, type FillGradient, type Layer } from "@musart/core";
import type { PropertyActions } from "../TextProperties";
import { ColorControl } from "../ColorControl";
import { NumberInput } from "../../shared/NumberInput";
import { SelectField } from "../../shared/SelectField";
import { IconButton } from "../../shared/IconButton";
import { ButtonGroup } from "../../ui/button-group";
import styles from "./GradientControl.module.css";
import "./messages";

function cssPaint(gradient: FillGradient) {
  const stops = gradient.stops.map((stop) => `${stop.color} ${stop.offset * 100}%`).join(", ");
  return gradient.kind === "linear"
    ? `linear-gradient(${gradient.angle + 90}deg, ${stops})`
    : `radial-gradient(ellipse closest-side at center, ${stops})`;
}

/** Only this control changes selection; paint gestures publish imperative preview patches. */
export function GradientControl({
  layer,
  patch,
  preview,
  cancel,
}: PropertyActions & { layer: Layer }) {
  const { t } = useTranslation("gradient");
  const [selected, setSelected] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  const gradient = layer.fillGradient;
  const index = Math.min(selected, (gradient?.stops.length ?? 1) - 1);
  const stop = gradient?.stops[index];
  const endpoint = index === 0 || index === (gradient?.stops.length ?? 1) - 1;

  function previewPaint(next: FillGradient) {
    if (layer.locked) return;
    if (bar.current) bar.current.style.background = cssPaint(next);
    preview({ fillGradient: next });
  }
  function commitPaint(next: FillGradient) {
    if (!layer.locked) patch({ fillGradient: next });
  }
  function cancelPaint() {
    if (gradient && bar.current) bar.current.style.background = cssPaint(gradient);
    cancel();
  }
  function updateStop(change: Partial<FillGradient["stops"][number]>): FillGradient {
    return {
      ...gradient!,
      stops: gradient!.stops.map((item, at) => (at === index ? { ...item, ...change } : item)),
    };
  }
  function addStop() {
    if (!gradient || gradient.stops.length >= 8 || layer.locked) return;
    let gap = -1,
      at = 1;
    for (let candidate = 1; candidate < gradient.stops.length; candidate++) {
      const width = gradient.stops[candidate]!.offset - gradient.stops[candidate - 1]!.offset;
      if (width > gap) {
        gap = width;
        at = candidate;
      }
    }
    const before = gradient.stops[at - 1]!,
      after = gradient.stops[at]!,
      stops = [...gradient.stops];
    const offset = (before.offset + after.offset) / 2;
    stops.splice(at, 0, { offset, color: sampleGradientColor(gradient, offset) });
    setSelected(at);
    commitPaint({ ...gradient, stops });
  }
  function removeStop() {
    if (!gradient || gradient.stops.length <= 2 || endpoint || layer.locked) return;
    setSelected(Math.max(0, index - 1));
    commitPaint({ ...gradient, stops: gradient.stops.filter((_, at) => at !== index) });
  }
  return (
    <div className={styles.control} aria-disabled={layer.locked || undefined}>
      <SelectField
        label={t("type")}
        value={gradient?.kind ?? "solid"}
        disabled={layer.locked}
        options={(["solid", "linear", "radial"] as const).map((value) => ({
          value,
          label: t(value),
        }))}
        onValueChange={(kind) => {
          if (layer.locked) return;
          if (kind === "solid") patch({ fillGradient: undefined });
          else
            commitPaint({
              kind: kind as FillGradient["kind"],
              angle: gradient?.angle ?? 0,
              stops: gradient?.stops ?? [
                { offset: 0, color: layer.fill },
                { offset: 1, color: "#ffffff" },
              ],
            });
        }}
      />
      {gradient && stop && (
        <div className={styles.editor} inert={layer.locked || undefined}>
          <div
            ref={bar}
            className={styles.preview}
            role="img"
            aria-label={t("preview")}
            style={{ background: cssPaint(gradient) }}
          />
          <div className={styles.stops}>
            {gradient.stops.map((item, at) => (
              <button
                type="button"
                key={at}
                aria-label={t("stop", { number: at + 1 })}
                aria-pressed={at === index}
                onClick={() => setSelected(at)}
              >
                <span style={{ background: item.color }} />
              </button>
            ))}
            <ButtonGroup className={styles.actions}>
              <IconButton label={t("add")} disabled={gradient.stops.length >= 8} onClick={addStop}>
                <Plus size={13} />
              </IconButton>
              <IconButton
                label={t("remove")}
                disabled={gradient.stops.length <= 2 || endpoint}
                onClick={removeStop}
              >
                <Minus size={13} />
              </IconButton>
            </ButtonGroup>
          </div>
          {gradient.kind === "linear" && (
            <NumberInput
              key={`${layer.id}:angle:${gradient.angle}`}
              label={t("angle")}
              value={gradient.angle}
              min={-360000}
              max={360000}
              unit="°"
              onPreview={(angle) => previewPaint({ ...gradient, angle })}
              onCommit={(angle) => commitPaint({ ...gradient, angle })}
              onCancel={cancelPaint}
            />
          )}
          <NumberInput
            key={`${layer.id}:${index}:${stop.offset}`}
            label={t("position")}
            value={stop.offset * 100}
            min={(gradient.stops[index - 1]?.offset ?? 0) * 100}
            max={(gradient.stops[index + 1]?.offset ?? 1) * 100}
            disabled={endpoint}
            unit="%"
            onPreview={(offset) => previewPaint(updateStop({ offset: offset / 100 }))}
            onCommit={(offset) => commitPaint(updateStop({ offset: offset / 100 }))}
            onCancel={cancelPaint}
          />
          {endpoint && <p className={styles.hint}>{t("endpoints")}</p>}
          <div role="group" aria-label={t("stopColor", { number: index + 1 })}>
            <ColorControl
              disabled={layer.locked}
              key={`${layer.id}:${index}:${stop.color}`}
              value={stop.color}
              onPreview={(color) => previewPaint(updateStop({ color }))}
              onCommit={(color) => commitPaint(updateStop({ color }))}
              onCancel={cancelPaint}
            />
          </div>
        </div>
      )}
    </div>
  );
}

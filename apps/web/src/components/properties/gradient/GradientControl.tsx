import { useLayoutEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort, FillGradient, Layer } from "@musart/core";
import type { PropertyActions } from "../TextProperties";
import { MotionNumberInput as NumberInput } from "../motion/MotionNumberInput";
import { MotionField } from "../motion/MotionField";
import { MotionValueField } from "../motion/MotionValueField";
import { createMotionTransport } from "../../../services/motion/transport";
import { motionTimeChanges } from "../../../state/session/motion-edit";
import { SelectField } from "../../shared/SelectField";
import { IconButton } from "../../shared/IconButton";
import { SegmentedTabs } from "../../shared/segmented/SegmentedTabs";
import { GradientBar } from "./GradientBar";
import { GradientStopRow } from "./GradientStopRow";
import { gradientRamp, insertStop, replaceStop, stopColorFields } from "./paint";
import styles from "./GradientControl.module.css";
import "./messages";

function presentPaint(root: HTMLElement | null, paint: FillGradient) {
  const ramp = root?.querySelector<HTMLElement>("[data-gradient-ramp]");
  if (ramp) ramp.style.backgroundImage = gradientRamp(paint);
  paint.stops.forEach((stop, at) => {
    const thumb = root?.querySelector<HTMLElement>(`[data-gradient-thumb="${at}"]`);
    if (thumb) {
      thumb.style.left = `${stop.offset * 100}%`;
      thumb.style.backgroundColor = stop.color;
      thumb.setAttribute("aria-valuenow", String(stop.offset * 100));
      thumb.setAttribute("aria-valuetext", `${Math.round(stop.offset * 100)}%`);
    }
    const row = root?.querySelector<HTMLElement>(`[data-gradient-row="${at}"]`);
    const swatch = row?.querySelector<HTMLElement>("[data-gradient-swatch]");
    if (swatch) swatch.style.backgroundColor = stop.color;
    const fields = stopColorFields(stop.color);
    for (const [selector, value] of [
      ["[data-gradient-position] input", String(Math.round(stop.offset * 10000) / 100)],
      ["[data-gradient-opacity] input", String(Math.round(fields.opacity * 100) / 100)],
      ["[data-gradient-hex]", fields.hex],
    ] as const) {
      const input = row?.querySelector<HTMLInputElement>(selector);
      if (input && document.activeElement !== input) input.value = value;
    }
  });
}

/** Only selection and committed commands render React; continuous paint drafts stay imperative. */
export function GradientControl({
  layer,
  engine,
  patch,
  preview,
  cancel,
}: PropertyActions & { layer: Layer; engine?: EnginePort }) {
  const { t } = useTranslation("gradient");
  const [selection, setSelection] = useState({ layerId: layer.id, index: 0 });
  const root = useRef<HTMLDivElement>(null);
  const gradient = layer.fillGradient;
  const index =
    selection.layerId === layer.id
      ? Math.min(selection.index, (gradient?.stops.length ?? 1) - 1)
      : 0;
  const invalidation = engine ? motionTimeChanges(engine) : undefined;
  function select(index: number) {
    setSelection((current) =>
      current.layerId === layer.id && current.index === index
        ? current
        : { layerId: layer.id, index },
    );
  }
  useLayoutEffect(() => {
    if (!engine || !gradient) return;
    const transport = createMotionTransport(engine);
    const update = () =>
      presentPaint(
        root.current,
        transport.readFrame()?.layers.find((item) => item.id === layer.id)?.fillGradient ??
          gradient,
      );
    const stop = transport.subscribe(update);
    update();
    return stop;
  }, [engine, layer.id, gradient]);
  function previewPaint(next: FillGradient) {
    if (layer.locked) return;
    presentPaint(root.current, next);
    preview({ fillGradient: next });
  }
  function commitPaint(next: FillGradient) {
    if (!layer.locked) patch({ fillGradient: next });
  }
  function cancelPaint() {
    if (gradient) presentPaint(root.current, gradient);
    cancel();
  }
  return (
    <div ref={root} className={styles.control} aria-disabled={layer.locked || undefined}>
      <SegmentedTabs
        mode="choice"
        size="compact"
        label={t("type")}
        value={gradient ? "gradient" : "solid"}
        disabled={layer.locked}
        items={[
          { value: "solid", label: t("solid") },
          { value: "gradient", label: t("gradient") },
        ]}
        onValueChange={(value) => {
          if (layer.locked) return;
          cancelPaint();
          select(0);
          patch({
            fillGradient:
              value === "solid"
                ? undefined
                : {
                    kind: "linear",
                    angle: 0,
                    stops: [
                      { offset: 0, color: layer.fill },
                      { offset: 1, color: "#ffffff" },
                    ],
                  },
          });
        }}
      />
      {gradient && (
        <div className={styles.editor} inert={layer.locked || undefined}>
          <div className={styles.settings}>
            <div className={styles.setting}>
              <span className={styles.caption}>{t("gradient")}</span>
              <MotionField
                engine={engine}
                target={{ kind: "layer", layerId: layer.id, property: "fillGradient.kind" }}
                label={t("gradientType")}
                disabled={layer.locked}
              >
                <MotionValueField
                  engine={engine}
                  target={{ kind: "layer", layerId: layer.id, property: "fillGradient.kind" }}
                  fallback={gradient.kind}
                >
                  {(kind) => (
                    <SelectField
                      label={t("gradientType")}
                      value={String(kind)}
                      disabled={layer.locked}
                      options={(["linear", "radial"] as const).map((value) => ({
                        value,
                        label: t(value),
                      }))}
                      onValueChange={(kind) =>
                        commitPaint({ ...gradient, kind: kind as FillGradient["kind"] })
                      }
                    />
                  )}
                </MotionValueField>
              </MotionField>
            </div>
            {gradient.kind === "linear" && (
              <div className={styles.setting}>
                <span className={styles.caption}>{t("angleLabel")}</span>
                <NumberInput
                  engine={engine}
                  target={{ kind: "layer", layerId: layer.id, property: "fillGradient.angle" }}
                  identity={layer}
                  label={t("angle")}
                  value={gradient.angle}
                  min={-360000}
                  max={360000}
                  unit="°"
                  disabled={layer.locked}
                  onPreview={(angle) => previewPaint({ ...gradient, angle })}
                  onCommit={(angle) => commitPaint({ ...gradient, angle })}
                  onCancel={cancelPaint}
                />
              </div>
            )}
          </div>
          <GradientBar
            gradient={gradient}
            identity={layer.id}
            selected={index}
            disabled={layer.locked}
            invalidation={invalidation}
            onSelect={select}
            onPreview={previewPaint}
            onCommit={commitPaint}
            onCancel={cancelPaint}
          />
          <div className={styles.stopsHeading}>
            <span className={styles.caption}>{t("stops")}</span>
            <IconButton
              label={t("add")}
              disabled={layer.locked || gradient.stops.length >= 8}
              onClick={() => {
                if (layer.locked) return;
                const next = insertStop(gradient);
                if (next) {
                  select(next.index);
                  commitPaint(next.gradient);
                }
              }}
            >
              <Plus size={14} />
            </IconButton>
          </div>
          <div className={styles.rows}>
            {gradient.stops.map((_, at) => (
              <GradientStopRow
                key={`${layer.id}:${at}`}
                gradient={gradient}
                index={at}
                ownerId={layer.id}
                identity={layer}
                selected={at === index}
                disabled={layer.locked}
                invalidation={invalidation}
                onSelect={() => select(at)}
                onPreview={(change) => previewPaint(replaceStop(gradient, at, change))}
                onCommit={(change) => commitPaint(replaceStop(gradient, at, change))}
                onCancel={cancelPaint}
                onRemove={() => {
                  if (
                    layer.locked ||
                    at === 0 ||
                    at === gradient.stops.length - 1 ||
                    gradient.stops.length <= 2
                  )
                    return;
                  select(Math.max(0, at - 1));
                  commitPaint({
                    ...gradient,
                    stops: gradient.stops.filter((_, position) => position !== at),
                  });
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

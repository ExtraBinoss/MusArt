import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import type { EnginePort, Layer } from "@musart/core";
import { useTranslation } from "react-i18next";
import { MotionStringInput } from "./motion/MotionStringInput";
import { MotionNumberInput as NumberInput } from "./motion/MotionNumberInput";
import { MotionField } from "./motion/MotionField";
import { MotionValueField } from "./motion/MotionValueField";
import { IconButton } from "../shared/IconButton";
import { FontPicker } from "./fonts/FontPicker";
export interface PropertyActions {
  patch: (patch: Partial<Layer>) => void;
  preview: (patch: Partial<Layer>) => void;
  cancel: () => void;
}
export function TextProperties({
  layer,
  engine,
  patch,
  preview,
  cancel,
}: PropertyActions & { layer: Layer; engine?: EnginePort }) {
  const { t } = useTranslation();
  return (
    <section className="inspector-section">
      <div className="section-title">
        <h3>{t("typography")}</h3>
      </div>
      <MotionField
        engine={engine}
        target={{ kind: "layer", layerId: layer.id, property: "text" }}
        label={t("textContent")}
        disabled={layer.locked}
      >
        <MotionValueField
          engine={engine}
          target={{ kind: "layer", layerId: layer.id, property: "text" }}
          fallback={layer.text}
        >
          {(value) => (
            <MotionStringInput
              engine={engine}
              target={{ kind: "layer", layerId: layer.id, property: "text" }}
              label={t("textContent")}
              value={String(value)}
              disabled={layer.locked}
              multiline
              onCommit={(text) => patch({ text })}
              onCancel={cancel}
            />
          )}
        </MotionValueField>
      </MotionField>
      <MotionField
        engine={engine}
        target={{ kind: "layer", layerId: layer.id, property: "fontFamily" }}
        label={t("fontFamily")}
        disabled={layer.locked}
        captureTarget={false}
      >
        <MotionValueField
          engine={engine}
          target={{ kind: "layer", layerId: layer.id, property: "fontFamily" }}
          fallback={layer.fontFamily}
        >
          {(family) => (
            <FontPicker
              key={layer.id}
              layer={{ ...layer, fontFamily: String(family) }}
              patch={patch}
              preview={preview}
              cancel={cancel}
            />
          )}
        </MotionValueField>
      </MotionField>
      <div className="fields-grid">
        {(
          [
            ["fontSize", 1, 1024, 1, "px"],
            ["fontWeight", 100, 900, 100, ""],
            ["lineHeight", 0.5, 5, 0.05, "×"],
            ["letterSpacing", -100, 100, 0.1, "px"],
          ] as const
        ).map(([key, min, max, step, unit]) => (
          <NumberInput
            engine={engine}
            target={{ kind: "layer", layerId: layer.id, property: key }}
            key={key}
            identity={layer}
            label={t(key)}
            value={layer[key]}
            resetValue={{ fontSize: 64, fontWeight: 600, lineHeight: 1.2, letterSpacing: 0 }[key]}
            min={min}
            max={max}
            step={step}
            unit={unit}
            disabled={layer.locked}
            onPreview={(value) => preview({ [key]: value })}
            onCommit={(value) => patch({ [key]: value })}
            onCancel={cancel}
          />
        ))}
      </div>
      <MotionField
        engine={engine}
        target={{ kind: "layer", layerId: layer.id, property: "textAlign" }}
        label={t("textAlignment")}
        disabled={layer.locked}
      >
        <MotionValueField
          engine={engine}
          target={{ kind: "layer", layerId: layer.id, property: "textAlign" }}
          fallback={layer.textAlign}
        >
          {(value) => (
            <div className="alignment-group" role="group" aria-label={t("textAlignment")}>
              {(
                [
                  ["left", AlignLeft, "alignLeft"],
                  ["center", AlignCenter, "alignCenter"],
                  ["right", AlignRight, "alignRight"],
                ] as const
              ).map(([textAlign, Icon, label]) => (
                <IconButton
                  key={textAlign}
                  label={t(label)}
                  active={value === textAlign}
                  disabled={layer.locked}
                  onClick={() => patch({ textAlign })}
                >
                  <Icon size={15} />
                </IconButton>
              ))}
            </div>
          )}
        </MotionValueField>
      </MotionField>
    </section>
  );
}

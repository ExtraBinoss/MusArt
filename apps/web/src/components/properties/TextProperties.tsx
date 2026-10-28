import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import type { Layer } from "@musart/core";
import { useTranslation } from "react-i18next";
import { Textarea } from "../ui/textarea";
import { NumberInput } from "../shared/NumberInput";
import { IconButton } from "../shared/IconButton";
import { FontPicker } from "./fonts/FontPicker";
export interface PropertyActions {
  patch: (patch: Partial<Layer>) => void;
  preview: (patch: Partial<Layer>) => void;
  cancel: () => void;
}
export function TextProperties({
  layer,
  patch,
  preview,
  cancel,
}: PropertyActions & { layer: Layer }) {
  const { t } = useTranslation();
  return (
    <section className="inspector-section">
      <div className="section-title">
        <h3>{t("typography")}</h3>
      </div>
      <Textarea
        key={`${layer.id}:${layer.text}`}
        aria-label={t("textContent")}
        defaultValue={layer.text}
        disabled={layer.locked}
        rows={3}
        onBlur={(event) => {
          if (event.target.value !== layer.text) patch({ text: event.target.value });
        }}
      />
      <FontPicker key={layer.id} layer={layer} patch={patch} preview={preview} cancel={cancel} />
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
            key={key}
            identity={layer}
            label={t(key)}
            value={layer[key]}
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
            active={layer.textAlign === textAlign}
            disabled={layer.locked}
            onClick={() => patch({ textAlign })}
          >
            <Icon size={15} />
          </IconButton>
        ))}
      </div>
    </section>
  );
}

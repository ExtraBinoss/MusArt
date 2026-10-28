import { Sun } from "lucide-react";
import { memo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  BLEND_MODES,
  getBlendDefinition,
  type Composition,
  type EnginePort,
  type Layer,
} from "@musart/core";
import { useLayerPreview } from "./use-layer-preview";
import { layerSelection } from "../menu/selection";
import { NumberInput } from "../../shared/NumberInput";
import { SelectField } from "../../shared/SelectField";
import { useRenderMetrics } from "../../../state/session/render-metrics";
import "../messages";

export const LayerCompositing = memo(function LayerCompositing({
  engine,
  page,
  selection,
  run,
}: {
  engine: EnginePort;
  page: Composition;
  selection: readonly string[];
  run: (task: () => void) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  useRenderMetrics(element);
  const { t } = useTranslation();
  const edit = useLayerPreview(engine, page, selection, run, true);
  const state = layerSelection(page, selection),
    selected = state.selected;
  const disabled = !state.editable;
  const opacity = selected[0]?.opacity ?? 1,
    blend = selected[0]?.blendMode ?? "normal";
  const mixedOpacity = selected.some((layer) => layer.opacity !== opacity);
  const mixedBlend = selected.some((layer) => layer.blendMode !== blend);
  return (
    <div
      ref={element}
      className="layer-compositing"
      role="group"
      aria-label={t("layerControls:compositing")}
    >
      <NumberInput
        identity={selected}
        label={t("opacity")}
        scrubLabel={<Sun size={14} />}
        value={opacity * 100}
        resetValue={100}
        mixed={mixedOpacity}
        min={0}
        max={100}
        unit="%"
        disabled={disabled}
        onStart={edit.begin}
        onPreview={(value) => edit.preview({ opacity: value / 100 })}
        onCommit={(value) => edit.commit({ opacity: value / 100 })}
        onCancel={edit.cancel}
      />
      <SelectField
        label={t("blendMode")}
        value={mixedBlend ? "mixed" : blend}
        disabled={disabled}
        options={[
          ...(mixedBlend
            ? [{ value: "mixed", label: t("layerControls:mixed"), disabled: true }]
            : []),
          ...BLEND_MODES.map((mode) => ({
            value: mode,
            label: t(getBlendDefinition(mode).nameKey),
          })),
        ]}
        onPreview={(value) => {
          if (BLEND_MODES.includes(value as Layer["blendMode"]))
            edit.preview({ blendMode: value as Layer["blendMode"] });
        }}
        onPreviewCancel={edit.cancel}
        onValueChange={(value) => {
          if (BLEND_MODES.includes(value as Layer["blendMode"]))
            edit.commit({ blendMode: value as Layer["blendMode"] });
        }}
      />
    </div>
  );
});

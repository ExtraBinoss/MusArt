import { useTranslation } from "react-i18next";
import type { Composition, Layer } from "@musart/core";
import { NumberInput } from "../shared/NumberInput";
export function SpacingPanel({
  page,
  layer,
  onLayerPatch,
  onPagePatch,
  onLayerPreview,
  onPagePreview,
  onCancel,
}: {
  page: Composition;
  layer?: Layer;
  onLayerPatch: (patch: Partial<Layer>) => void;
  onPagePatch: (patch: Partial<Composition>) => void;
  onLayerPreview: (patch: Partial<Layer>) => void;
  onPagePreview: (patch: Partial<Composition>) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const target = layer ?? page;
  return (
    <section className="inspector-section spacing-section">
      {(layer ? (["margin", "padding"] as const) : (["margins"] as const)).map((key) => {
        const current = key === "margins" ? page.margins : layer?.[key];
        const insets = { top: 0, right: 0, bottom: 0, left: 0, ...current };
        function apply(edge: keyof typeof insets, value: number, preview = false) {
          const patch = { [key]: { ...insets, [edge]: value } };
          if (layer) (preview ? onLayerPreview : onLayerPatch)(patch);
          else (preview ? onPagePreview : onPagePatch)(patch);
        }
        return (
          <div key={key}>
            <h3>{t(key)}</h3>
            <div className="fields-grid">
              {(["top", "right", "bottom", "left"] as const).map((edge) => (
                <NumberInput
                  key={edge}
                  identity={target}
                  label={t(edge)}
                  value={insets[edge]}
                  min={0}
                  max={32768}
                  unit="px"
                  disabled={layer?.locked}
                  onPreview={(value) => apply(edge, value, true)}
                  onCommit={(value) => apply(edge, value)}
                  onCancel={onCancel}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

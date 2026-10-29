import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LayoutTemplate } from "lucide-react";
import { SOCIAL_PRESETS, type CompositionPreset } from "@musart/core";
import { Button } from "../../ui/button";
import { Tabs, TabsContent } from "../../ui/tabs";
import { SegmentedTabs } from "../../shared/segmented/SegmentedTabs";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { SocialBrandIcon } from "../../assets/SocialBrandIcon";
import { PresetPreview } from "./PresetPreview";
import "./messages";
import "./guides.css";

export function GuidePresets({
  bounds,
  disabled,
  onAppend,
}: {
  bounds: { width: number; height: number };
  disabled?: boolean;
  onAppend(this: void, preset: CompositionPreset): void;
}) {
  const { t } = useTranslation();
  const [openedFor, setOpenedFor] = useState<typeof bounds | null>(null),
    [category, setCategory] = useState("all");
  return (
    <Popover
      open={openedFor === bounds}
      onOpenChange={(open) => setOpenedFor(open ? bounds : null)}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" disabled={disabled} className="guide-presets-trigger">
          <LayoutTemplate size={13} />
          {t("guidePanel:presets")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="guide-presets"
        aria-label={t("guidePanel:title")}
      >
        <PresetCatalogue
          category={category}
          disabled={disabled}
          onCategoryChange={setCategory}
          onAppend={(preset) => {
            if (disabled) return;
            onAppend(preset);
            setOpenedFor(null);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Closed popovers retain only their trigger and shell, never the preset grid. */
function PresetCatalogue({
  category,
  disabled,
  onCategoryChange,
  onAppend,
}: {
  category: string;
  disabled?: boolean;
  onCategoryChange: (category: string) => void;
  onAppend: (preset: CompositionPreset) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <h3>{t("guidePanel:title")}</h3>
      <p>{t("guidePanel:description")}</p>
      <Tabs value={category} onValueChange={onCategoryChange} className="guide-preset-tabs">
        <SegmentedTabs
          value={category}
          size="compact"
          disabled={disabled}
          label={t("guidePanel:category")}
          items={["all", "social", "video"].map((value) => ({
            value,
            label: t(`guidePanel:${value}`),
          }))}
        />
        <TabsContent value={category} className="guide-preset-content">
          <ScrollShadow surface="var(--popover)" className="guide-preset-scroll">
            <div className="guide-presets-grid">
              {SOCIAL_PRESETS.filter(
                (preset) => category === "all" || preset.category === category,
              ).map((preset) => {
                const name = t(preset.nameKey);
                return (
                  <Button
                    key={preset.id}
                    variant="ghost"
                    className="guide-preset"
                    aria-label={t("guidePanel:append", { name })}
                    onClick={() => {
                      if (disabled) return;
                      onAppend(preset);
                    }}
                  >
                    <PresetPreview preset={preset} />
                    <span className="guide-preset-name">
                      <SocialBrandIcon id={preset.brandId} size={13} />
                      <span>{name}</span>
                    </span>
                    <span className="guide-preset-dimensions">
                      {preset.width} × {preset.height}
                    </span>
                  </Button>
                );
              })}
            </div>
          </ScrollShadow>
        </TabsContent>
      </Tabs>
    </>
  );
}

import { useState } from "react";
import { LayoutTemplate } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PRESETS, type CompositionPreset } from "@musart/core";
import { Button } from "../../ui/button";
import { Tabs, TabsContent } from "../../ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { SegmentedTabs } from "../../shared/segmented/SegmentedTabs";
import { ScrollShadow } from "../../shared/scroll/ScrollShadow";
import { SocialBrandIcon } from "../../assets/SocialBrandIcon";
import "./messages";

export function FormatPresets({
  selected,
  disabled,
  onChoose,
}: {
  selected: string;
  disabled?: boolean;
  onChoose: (preset: CompositionPreset | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("social");
  const preset = PRESETS.find((item) => item.id === selected);
  function choose(value: CompositionPreset | null) {
    if (disabled) return;
    onChoose(value);
    setOpen(false);
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="creation-preset-trigger"
          disabled={disabled}
          aria-label={t("creation:format")}
        >
          <LayoutTemplate size={16} />
          <span>{preset ? t(preset.nameKey) : t("creation:custom")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="creation-presets" align="start" collisionPadding={12}>
        <Tabs value={category} onValueChange={setCategory}>
          <SegmentedTabs
            value={category}
            size="compact"
            disabled={disabled}
            label={t("creation:format")}
            items={["social", "video", "print", "screen"].map((value) => ({
              value,
              label: t(`creation:${value}`),
            }))}
          />
          <TabsContent value={category}>
            <ScrollShadow className="creation-preset-scroll" surface="var(--popover)">
              <div className="creation-preset-grid">
                <Button
                  type="button"
                  variant="ghost"
                  className="creation-preset"
                  disabled={disabled}
                  onClick={() => choose(null)}
                  aria-pressed={selected === "custom"}
                >
                  <span className="creation-mini-paper" aria-hidden style={{ aspectRatio: "1" }}>
                    ＋
                  </span>
                  <span>{t("creation:custom")}</span>
                </Button>
                {PRESETS.filter((item) => item.category === category).map((item) => (
                  <Button
                    type="button"
                    variant="ghost"
                    className="creation-preset"
                    disabled={disabled}
                    key={item.id}
                    aria-pressed={selected === item.id}
                    onClick={() => choose(item)}
                  >
                    <span
                      className="creation-mini-paper"
                      aria-hidden
                      style={{ aspectRatio: `${item.width}/${item.height}` }}
                    >
                      <SocialBrandIcon id={item.brandId} size={18} />
                    </span>
                    <span>{t(item.nameKey)}</span>
                    <small>
                      {item.width} × {item.height}
                    </small>
                  </Button>
                ))}
              </div>
            </ScrollShadow>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

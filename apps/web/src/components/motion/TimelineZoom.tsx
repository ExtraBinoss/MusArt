import { useTranslation } from "react-i18next";
import { Slider } from "../ui/slider";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function TimelineZoom({
  value,
  disabled,
  onPreview,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onPreview: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const { t } = useTranslation("motion");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Slider
          className="motion-zoom"
          tone="primary"
          disabled={disabled}
          min={20}
          max={640}
          step={10}
          value={[value]}
          aria-label={t("zoom")}
          onValueChange={(values) => onPreview(values[0] ?? 120)}
          onValueCommit={(values) => onCommit(values[0] ?? value)}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="motion-control-tooltip">
        <span>{t("zoom")}</span>
        <KbdGroup>
          <Kbd>Ctrl / ⌘</Kbd>
          <Kbd>{t("wheel")}</Kbd>
        </KbdGroup>
      </TooltipContent>
    </Tooltip>
  );
}

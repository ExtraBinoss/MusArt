import { useTranslation } from "react-i18next";
import { Slider } from "../ui/slider";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import "./messages";

/** The desktop ruler and mobile footer share the same zoom gesture and save boundary. */
export function TimelineZoomControl({
  zoom,
  disabled,
  onChange,
  onCommit,
}: {
  zoom: number;
  disabled: boolean;
  onChange: (value: number) => void;
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
          value={[zoom]}
          aria-label={t("zoom")}
          onValueChange={(values) => onChange(values[0] ?? zoom)}
          onValueCommit={(values) => onCommit(values[0] ?? zoom)}
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
